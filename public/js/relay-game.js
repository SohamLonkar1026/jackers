// relay-game.js — realtime transport for Jackers.
// Admin browser = game authority. Cloudflare Durable Object (jackers-relay) = WebSocket fan-out.
// Same public API the old supabase-game.js exposed, so game.html is unchanged in shape.

const RELAY_URL = 'wss://jackers-relay.sohamlonkar1026.workers.dev';

// Stable per-tab session id so a refresh keeps the same seat.
const SESSION_ID = (() => {
    let id = null;
    try { id = sessionStorage.getItem('jackersSessionId'); } catch (e) { }
    if (!id) {
        id = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        try { sessionStorage.setItem('jackersSessionId', id); } catch (e) { }
    }
    return id;
})();

let ws = null;
let _currentRoomId = null;
let _outbox = [];
let _reconnectDelay = 500;
let _pingTimer = null;
let _onState = null, _onError = null;

let _isHost = false;
let _joinData = null;      // remembered so we can re-join after a reconnect
let _joined = false;
let _joinRetryTimer = null;

let _roomPassword = '';
let _players = new Map(); // sessionId -> {sessionId, name, wallet, initialWallet, isModerator, lastBid, totalBid, wins, adminGiven}
let _pot = 0;
let _totalGames = 0;
let _payouts = [];         // winning-pool payouts, newest first: {game, winner, amount, at, from:[{name, amount}]}
const MAX_PAYOUTS = 50;
let _stateInterval = null;

function initGameEngine() {
    console.log('Game engine ready. Session:', SESSION_ID);
}

// ===== TRANSPORT =====
function connectToRoom(roomId) {
    _currentRoomId = String(roomId || 'default').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'default';
    openSocket();
}

function openSocket() {
    ws = new WebSocket(RELAY_URL + '/room/' + encodeURIComponent(_currentRoomId));

    ws.onopen = () => {
        console.log('Connected to room', _currentRoomId);
        _reconnectDelay = 500;
        const queued = _outbox; _outbox = [];
        queued.forEach((m) => ws.send(m));
        clearInterval(_pingTimer);
        _pingTimer = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000);
        // After a drop, re-announce ourselves
        if (_isHost) broadcastState();
        else if (_joinData) sendPlayerJoin();
    };

    ws.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        let d;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        handleMessage(d);
    };

    ws.onclose = () => {
        clearInterval(_pingTimer);
        console.warn('Relay connection closed, reconnecting in', _reconnectDelay, 'ms');
        setTimeout(openSocket, _reconnectDelay);
        _reconnectDelay = Math.min(_reconnectDelay * 2, 8000);
    };

    ws.onerror = () => { try { ws.close(); } catch (e) { } };
}

function send(payload) {
    const msg = JSON.stringify(payload);
    if (ws && ws.readyState === 1) ws.send(msg);
    else _outbox.push(msg);
}

function handleMessage(d) {
    if (!d || typeof d.type !== 'string') return;

    // ----- everyone -----
    if (d.type === 'gameState') {
        // A player is "in" once the admin's state lists them, even if the confirm was missed
        if (!_isHost && !_joined && d.state && Array.isArray(d.state.players) &&
            d.state.players.some((p) => p.socketId === SESSION_ID)) {
            markJoined({ isModerator: false, player: { session_id: SESSION_ID, name: _joinData && _joinData.name } });
        }
        if (_onState) _onState(d.state);
        return;
    }
    if (d.type === 'moneyAdded') { call('onMoneyAdded', d); return; }
    if (d.type === 'winner') { call('onWinnerSelected', d); return; }
    if (d.type === 'poolReset') { call('onPoolReset'); return; }
    if (d.type === 'roomReset') { call('onRoomReset'); return; }
    if (d.type === 'settlement') { call('onSettlement', d.settlements); return; }
    if (d.type === 'joinConfirm') {
        if (d.targetSession === SESSION_ID) markJoined(d);
        return;
    }
    if (d.type === 'errorMsg') {
        if (d.targetSession === SESSION_ID) {
            if (d.fatal) stopJoinRetry();
            if (_onError) _onError({ message: d.message });
        }
        return;
    }

    // ----- admin only: process player actions -----
    if (!_isHost) return;
    if (d.type === 'playerJoin') hostHandleJoin(d);
    else if (d.type === 'bet') hostHandleBet(d);
    else if (d.type === 'selectWinner') hostHandleWinner(d);
    else if (d.type === 'adjustWallet') hostHandleAdjust(d);
    else if (d.type === 'resetRoom') { if (isFromHost(d)) hostHandleReset(); }
    else if (d.type === 'showSettlement') hostHandleSettlement(d);
    else if (d.type === 'adjustPool') hostHandlePoolAdjust(d);
}

function call(name, arg) {
    if (typeof window[name] === 'function') window[name](arg);
}

function markJoined(d) {
    const first = !_joined;
    _joined = true;
    stopJoinRetry();
    if (first) call('onJoinedRoom', d);
}

function stopJoinRetry() {
    clearInterval(_joinRetryTimer);
    _joinRetryTimer = null;
}

// ===== SEND FUNCTIONS =====
function sendJoin(data) {
    _joinData = data;
    if (data.isAdmin) {
        becomeHost(data);
    } else {
        sendPlayerJoin();
        // Keep knocking until the admin answers (admin may not be at the table yet)
        stopJoinRetry();
        _joinRetryTimer = setInterval(() => { if (!_joined) sendPlayerJoin(); }, 3000);
    }
}

function sendPlayerJoin() {
    send({
        type: 'playerJoin', fromSession: SESSION_ID,
        name: _joinData.name, initialWallet: _joinData.initialWallet,
        roomPassword: _joinData.roomPassword
    });
}

function becomeHost(data) {
    _isHost = true;
    _roomPassword = data.roomPassword || '';

    let restored = false;
    try {
        const saved = localStorage.getItem('jackers_state_' + _currentRoomId);
        if (saved) {
            const parsed = JSON.parse(saved);
            _pot = parsed.pot || 0;
            _totalGames = parsed.totalGames || 0;
            _payouts = Array.isArray(parsed.payouts) ? parsed.payouts.slice(0, MAX_PAYOUTS) : [];
            _players = new Map();
            (parsed.players || []).forEach((p) => {
                if (p.isModerator) p.sessionId = SESSION_ID;
                _players.set(p.sessionId, p);
            });
            restored = _players.size > 0;
            if (restored) console.log('Restored game state from local storage');
        }
    } catch (e) {
        console.error('Failed to restore state', e);
    }

    if (!restored) {
        const w = parseInt(data.initialWallet) || 0;
        _players = new Map();
        _players.set(SESSION_ID, {
            sessionId: SESSION_ID, name: data.name, wallet: w, initialWallet: w,
            isModerator: true, lastBid: 0, totalBid: 0, wins: 0, adminGiven: 0
        });
    }

    if (_stateInterval) clearInterval(_stateInterval);
    _stateInterval = setInterval(broadcastState, 3000);

    markJoined({ isModerator: true, player: { session_id: SESSION_ID, name: data.name } });
    broadcastState();
}

function sendBet(amount) {
    send({ type: 'bet', fromSession: SESSION_ID, amount: parseInt(amount) });
}
function sendSelectWinner(sessionId, name) {
    send({ type: 'selectWinner', fromSession: SESSION_ID, winnerSession: sessionId, winnerName: name });
}
function sendAdjustWallet(targetSession, targetName, amount) {
    send({ type: 'adjustWallet', fromSession: SESSION_ID, targetSession, targetName, amount: parseInt(amount) });
}
function sendResetRoom() {
    send({ type: 'resetRoom', fromSession: SESSION_ID });
}
function sendSettlement(settlements) {
    send({ type: 'showSettlement', fromSession: SESSION_ID, settlements });
}
function sendAdjustPool(amount) {
    send({ type: 'adjustPool', fromSession: SESSION_ID, amount: parseInt(amount) });
}

// ===== HOST (ADMIN) HANDLERS =====
function isFromHost(d) {
    return d.fromSession === SESSION_ID;
}

function broadcastState() {
    if (!_isHost) return;
    const playersArr = Array.from(_players.values());
    const ledger = {};
    playersArr.forEach((p) => { ledger[p.name] = p.adminGiven || 0; });

    try {
        localStorage.setItem('jackers_state_' + _currentRoomId,
            JSON.stringify({ players: playersArr, pot: _pot, totalGames: _totalGames, payouts: _payouts }));
    } catch (e) { }

    send({
        type: 'gameState',
        state: {
            players: playersArr.map((p) => ({
                socketId: p.sessionId, name: p.name, wallet: p.wallet,
                initialWallet: p.initialWallet, isModerator: p.isModerator,
                lastBid: p.lastBid, totalBid: p.totalBid, wins: p.wins, adminGiven: p.adminGiven
            })),
            pot: _pot,
            moderatorId: playersArr.find((p) => p.isModerator)?.sessionId || null,
            ledger, totalGames: _totalGames, payouts: _payouts
        }
    });
}

function hostHandleJoin(d) {
    if (d.fromSession === SESSION_ID) return;
    if ((d.roomPassword || '') !== _roomPassword) {
        send({ type: 'errorMsg', targetSession: d.fromSession, message: 'Invalid room password', fatal: true });
        return;
    }
    const name = String(d.name || '').trim().slice(0, 30);
    if (!name) return;

    const existing = Array.from(_players.values()).find((p) => p.name === name);
    if (existing && existing.isModerator) {
        send({ type: 'errorMsg', targetSession: d.fromSession, message: 'That name is taken by the admin. Pick another.', fatal: true });
        return;
    }
    if (existing) {
        _players.delete(existing.sessionId);
        existing.sessionId = d.fromSession;
        _players.set(d.fromSession, existing);
    } else if (!_players.has(d.fromSession)) {
        const w = parseInt(d.initialWallet) || 0;
        _players.set(d.fromSession, {
            sessionId: d.fromSession, name, wallet: w, initialWallet: w,
            isModerator: false, lastBid: 0, totalBid: 0, wins: 0, adminGiven: 0
        });
    }
    send({ type: 'joinConfirm', targetSession: d.fromSession, isModerator: false, player: { session_id: d.fromSession, name } });
    broadcastState();
}

function hostHandleBet(d) {
    const p = _players.get(d.fromSession);
    if (!p) return;
    const amt = parseInt(d.amount);
    if (isNaN(amt) || amt <= 0) return send({ type: 'errorMsg', targetSession: d.fromSession, message: 'Invalid amount' });
    if (amt > p.wallet) return send({ type: 'errorMsg', targetSession: d.fromSession, message: 'Insufficient funds! You only have ₹' + p.wallet });

    p.wallet -= amt;
    p.lastBid = amt;
    p.totalBid = (p.totalBid || 0) + amt;
    _pot += amt;

    send({ type: 'moneyAdded', sessionId: d.fromSession, amount: amt });
    broadcastState();
}

function hostHandleWinner(d) {
    if (!isFromHost(d)) return;
    let winner = _players.get(d.winnerSession);
    if (!winner && d.winnerName) winner = Array.from(_players.values()).find((p) => p.name === d.winnerName);
    if (!winner) return;

    const wonAmount = _pot;
    // Who put money into this pool (captured before the round's bids are cleared)
    const from = Array.from(_players.values())
        .filter((p) => (p.totalBid || 0) > 0)
        .map((p) => ({ name: p.name, amount: p.totalBid }))
        .sort((a, b) => b.amount - a.amount);

    winner.wallet += wonAmount;
    winner.wins = (winner.wins || 0) + 1;
    _pot = 0;
    _totalGames++;
    _payouts.unshift({ game: _totalGames, winner: winner.name, amount: wonAmount, at: Date.now(), from });
    if (_payouts.length > MAX_PAYOUTS) _payouts.length = MAX_PAYOUTS;
    _players.forEach((p) => { p.lastBid = 0; p.totalBid = 0; });

    send({ type: 'winner', winnerSessionId: winner.sessionId, winnerName: winner.name, amount: wonAmount });
    broadcastState();
}

function hostHandleAdjust(d) {
    if (!isFromHost(d)) return;
    let target = _players.get(d.targetSession);
    if (!target && d.targetName) target = Array.from(_players.values()).find((p) => p.name === d.targetName);
    if (!target) return;
    const amt = parseInt(d.amount);
    if (isNaN(amt)) return;
    target.wallet += amt;
    target.adminGiven = (target.adminGiven || 0) + amt;
    broadcastState();
}

function hostHandleReset() {
    _pot = 0;
    _payouts = [];
    _players.forEach((p) => {
        p.wallet = 0; p.initialWallet = 0; p.lastBid = 0;
        p.totalBid = 0; p.adminGiven = 0;
    });
    send({ type: 'roomReset' });
    broadcastState();
}

function hostHandleSettlement(d) {
    if (!isFromHost(d)) return;
    send({ type: 'settlement', settlements: d.settlements });
}

function hostHandlePoolAdjust(d) {
    if (!isFromHost(d)) return;
    const amt = parseInt(d.amount);
    if (isNaN(amt)) return;
    _pot = Math.max(0, _pot + amt);
    broadcastState();
}

// ===== CALLBACK REGISTRATION =====
function onGameState(cb) { _onState = cb; }
function onError(cb) { _onError = cb; }
