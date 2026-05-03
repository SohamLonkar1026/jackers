// supabase-game.js — Pure Broadcast relay, NO database
// Admin browser = game server. Supabase = WebSocket relay only.

const SUPABASE_URL = 'https://bmcubrlxapdngznvxonh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtY3Vicmx4YXBkbmd6bnZ4b25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4Mzg3NDcsImV4cCI6MjA4NzQxNDc0N30.3xQqDKAf5UxyXxtN0zS9CAAoLbB3psMTYexwRDCHSpA';
const SESSION_ID = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

let sb, channel;
let _onState = null, _onError = null, _onJoined = null;
let _onMoneyAdded = null, _onWinner = null, _onPoolReset = null, _onRoomReset = null, _onSettlement = null;

let _isHost = false;
let _roomPassword = '';
let _adminPassword = '';
let _players = new Map(); // sessionId -> {sessionId, name, wallet, initialWallet, isModerator, lastBid, totalBid, wins, adminGiven}
let _pot = 0;
let _totalGames = 0;
let _stateInterval = null;
let _currentRoomId = null;

function initGameEngine() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Game engine ready. Session:', SESSION_ID);
}

function connectToRoom(roomId) {
    _currentRoomId = roomId;
    channel = sb.channel('room-' + roomId, { config: { broadcast: { self: true } } });

    channel.on('broadcast', { event: 'action' }, (msg) => {
        const d = msg.payload;
        if (!d) return;

        // All clients receive gameState broadcasts
        if (d.type === 'gameState') {
            if (_onState) _onState(d.state);
            return;
        }
        if (d.type === 'moneyAdded') { if (_onMoneyAdded) _onMoneyAdded(d); return; }
        if (d.type === 'winner') { if (_onWinner) _onWinner(d); return; }
        if (d.type === 'poolReset') { if (_onPoolReset) _onPoolReset(); return; }
        if (d.type === 'roomReset') { if (_onRoomReset) _onRoomReset(); return; }
        if (d.type === 'settlement') { if (_onSettlement) _onSettlement(d.settlements); return; }
        if (d.type === 'joinConfirm' && d.targetSession === SESSION_ID) {
            if (_onJoined) _onJoined(d);
            return;
        }
        if (d.type === 'errorMsg' && d.targetSession === SESSION_ID) {
            if (_onError) _onError({ message: d.message });
            return;
        }

        // ===== ADMIN ONLY: process player actions =====
        if (!_isHost) return;

        if (d.type === 'playerJoin') { hostHandleJoin(d); }
        else if (d.type === 'bet') { hostHandleBet(d); }
        else if (d.type === 'selectWinner') { hostHandleWinner(d); }
        else if (d.type === 'adjustWallet') { hostHandleAdjust(d); }
        else if (d.type === 'resetRoom') { hostHandleReset(); }
        else if (d.type === 'showSettlement') { hostHandleSettlement(d); }
        else if (d.type === 'adjustPool') { hostHandlePoolAdjust(d); }
    });

    channel.subscribe((status) => {
        console.log('Channel status:', status);
        if (status === 'SUBSCRIBED') {
            console.log('Connected to room channel');
        }
    });
}

// ===== SEND FUNCTIONS (called by both admin and player) =====
function send(payload) {
    channel.send({ type: 'broadcast', event: 'action', payload });
}

function sendJoin(data) {
    const isAdmin = data.isAdmin;
    if (isAdmin) {
        // This client IS the admin — become the host
        _isHost = true;
        _roomPassword = data.roomPassword || '';
        _adminPassword = data.adminPassword || '';

        // Try to load state from localStorage
        const saved = localStorage.getItem('jackers_state_' + _currentRoomId);
        let restored = false;
        
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                _pot = parsed.pot || 0;
                _totalGames = parsed.totalGames || 0;
                
                _players = new Map();
                parsed.players.forEach(p => {
                    // Update the admin's session ID since it changed on refresh
                    if (p.isModerator) {
                        p.sessionId = SESSION_ID;
                    }
                    _players.set(p.sessionId, p);
                });
                restored = true;
                console.log("Restored game state from local storage");
            } catch(e) {
                console.error("Failed to restore state", e);
            }
        }
        
        if (!restored) {
            // Add self as player (new game)
            const w = parseInt(data.initialWallet) || 0;
            _players.set(SESSION_ID, {
                sessionId: SESSION_ID, name: data.name, wallet: w, initialWallet: w,
                isModerator: true, lastBid: 0, totalBid: 0, wins: 0, adminGiven: 0
            });
        }

        // Start broadcasting state periodically (heartbeat)
        if (_stateInterval) clearInterval(_stateInterval);
        _stateInterval = setInterval(() => broadcastState(), 3000);

        // Send join confirmation to self
        setTimeout(() => {
            send({ type: 'joinConfirm', targetSession: SESSION_ID, isModerator: true, player: { session_id: SESSION_ID, name: data.name } });
            broadcastState();
        }, 500);
    } else {
        // Player — send join request to admin
        send({
            type: 'playerJoin', fromSession: SESSION_ID,
            name: data.name, initialWallet: data.initialWallet,
            roomPassword: data.roomPassword
        });
    }
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
function broadcastState() {
    const playersArr = Array.from(_players.values());
    const ledger = {};
    playersArr.forEach(p => { ledger[p.name] = p.adminGiven || 0; });

    // Save to LocalStorage so admin can refresh without losing game state
    const stateObj = { players: playersArr, pot: _pot, totalGames: _totalGames };
    localStorage.setItem('jackers_state_' + _currentRoomId, JSON.stringify(stateObj));

    send({
        type: 'gameState',
        state: {
            players: playersArr.map(p => ({
                socketId: p.sessionId, name: p.name, wallet: p.wallet,
                initialWallet: p.initialWallet, isModerator: p.isModerator,
                lastBid: p.lastBid, totalBid: p.totalBid, wins: p.wins, adminGiven: p.adminGiven
            })),
            pot: _pot,
            moderatorId: Array.from(_players.values()).find(p => p.isModerator)?.sessionId || null,
            ledger, totalGames: _totalGames
        }
    });
}

function hostHandleJoin(d) {
    if (d.roomPassword !== _roomPassword) {
        send({ type: 'errorMsg', targetSession: d.fromSession, message: 'Invalid room password' });
        return;
    }
    // Check if player name already exists (reconnect)
    let existing = Array.from(_players.values()).find(p => p.name === d.name);
    if (existing) {
        _players.delete(existing.sessionId);
        existing.sessionId = d.fromSession;
        _players.set(d.fromSession, existing);
    } else {
        const w = parseInt(d.initialWallet) || 0;
        _players.set(d.fromSession, {
            sessionId: d.fromSession, name: d.name, wallet: w, initialWallet: w,
            isModerator: false, lastBid: 0, totalBid: 0, wins: 0, adminGiven: 0
        });
    }
    send({ type: 'joinConfirm', targetSession: d.fromSession, isModerator: false, player: { session_id: d.fromSession, name: d.name } });
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
    let winner = _players.get(d.winnerSession);
    if (!winner && d.winnerName) {
        winner = Array.from(_players.values()).find(p => p.name === d.winnerName);
    }
    if (!winner) return;

    winner.wallet += _pot;
    winner.wins = (winner.wins || 0) + 1;
    const wonAmount = _pot;
    _pot = 0;
    _totalGames++;
    _players.forEach(p => { p.lastBid = 0; p.totalBid = 0; });

    send({ type: 'winner', winnerSessionId: winner.sessionId, winnerName: winner.name, amount: wonAmount });
    broadcastState();
}

function hostHandleAdjust(d) {
    let target = _players.get(d.targetSession);
    if (!target && d.targetName) {
        target = Array.from(_players.values()).find(p => p.name === d.targetName);
    }
    if (!target) return;
    const amt = parseInt(d.amount);
    if (isNaN(amt)) return;
    target.wallet += amt;
    target.adminGiven = (target.adminGiven || 0) + amt;
    broadcastState();
}

function hostHandleReset() {
    _pot = 0;
    _players.forEach(p => {
        p.wallet = 0; p.initialWallet = 0; p.lastBid = 0;
        p.totalBid = 0; p.adminGiven = 0;
    });
    send({ type: 'roomReset' });
    broadcastState();
}

function hostHandleSettlement(d) {
    send({ type: 'settlement', settlements: d.settlements });
}

function hostHandlePoolAdjust(d) {
    const amt = parseInt(d.amount);
    if (isNaN(amt)) return;
    _pot += amt;
    if (_pot < 0) _pot = 0;
    broadcastState();
}

// ===== CALLBACK REGISTRATION =====
function onGameState(cb) { _onState = cb; }
function onError(cb) { _onError = cb; }
