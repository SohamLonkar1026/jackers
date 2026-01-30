// Dealer-specific Socket.IO handling and UI logic

let dealerName = '';
let currentGameState = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    
    // Check if already connected
    socket.on('gameState', (state) => {
        currentGameState = state;
        updateDealerUI(state);
    });

    socket.on('dealerConfirmed', (data) => {
        dealerName = data.name;
        document.getElementById('dealerName').textContent = dealerName;
        document.getElementById('dealerLogin').style.display = 'none';
        document.getElementById('dealerDashboard').style.display = 'block';
    });
});

function joinAsDealer() {
    const nameInput = document.getElementById('dealerNameInput');
    const name = nameInput.value.trim();
    
    if (!name) {
        showError('Please enter your name');
        return;
    }

    socket.emit('dealerJoin', { name: name });
}

function setGameType(gameType) {
    socket.emit('dealerAction', {
        action: 'setGameType',
        gameType: gameType
    });

    // Update UI
    document.getElementById('btnBlackjack').classList.toggle('active', gameType === 'blackjack');
    document.getElementById('btnTeenPatti').classList.toggle('active', gameType === 'teen-patti');
}

function startRound() {
    socket.emit('dealerAction', { action: 'startRound' });
}

function endRound() {
    socket.emit('dealerAction', { action: 'endRound' });
}

function resetRound() {
    if (confirm('Reset current round? All bets will be cleared.')) {
        socket.emit('dealerAction', { action: 'resetRound' });
    }
}

function resetGame() {
    if (confirm('Reset entire game? All players and data will be cleared.')) {
        socket.emit('dealerAction', { action: 'resetGame' });
    }
}

function selectWinner(playerSocketId) {
    socket.emit('dealerAction', {
        action: 'selectWinner',
        winnerSocketId: playerSocketId
    });
}

function adjustWallet(playerSocketId, playerName) {
    const amount = prompt(`Adjust wallet for ${playerName}:\n(Enter positive number to add, negative to subtract)`);
    if (amount === null) return;

    const numAmount = parseInt(amount);
    if (isNaN(numAmount)) {
        showError('Invalid amount');
        return;
    }

    const allowNegative = confirm('Allow negative balance?');
    
    socket.emit('dealerAction', {
        action: 'adjustWallet',
        playerSocketId: playerSocketId,
        amount: numAmount,
        allowNegative: allowNegative
    });
}

function kickPlayer(playerSocketId) {
    if (confirm('Kick this player?')) {
        socket.emit('dealerAction', {
            action: 'kickPlayer',
            playerSocketId: playerSocketId
        });
    }
}

function updateDealerUI(state) {
    if (!state) return;

    // Update game type
    if (state.gameType) {
        document.getElementById('btnBlackjack').classList.toggle('active', state.gameType === 'blackjack');
        document.getElementById('btnTeenPatti').classList.toggle('active', state.gameType === 'teen-patti');
        document.getElementById('currentGameType').textContent = 
            state.gameType === 'blackjack' ? '🃏 Blackjack' : '🎴 Teen Patti';
    } else {
        document.getElementById('currentGameType').textContent = 'No game selected';
    }

    // Update player count
    const playerCount = state.players ? state.players.length : 0;
    document.getElementById('playerCount').textContent = playerCount;

    // Update players list
    const playersList = document.getElementById('playersList');
    if (!state.players || state.players.length === 0) {
        playersList.innerHTML = '<p class="empty-state">No players connected yet</p>';
    } else {
        playersList.innerHTML = state.players.map(player => {
            const bet = state.currentRound?.bets?.[player.socketId] || 0;
            return `
                <div class="player-item">
                    <div class="player-info">
                        <div class="player-name">${escapeHtml(player.name)}</div>
                        <div class="player-wallet">Wallet: ${player.wallet} coins</div>
                        ${bet > 0 ? `<div class="player-bet">Bet: ${bet} coins</div>` : ''}
                    </div>
                    <div class="player-actions">
                        <button class="btn-small btn-adjust" onclick="adjustWallet('${player.socketId}', '${escapeHtml(player.name)}')">
                            Adjust Wallet
                        </button>
                        <button class="btn-small btn-kick" onclick="kickPlayer('${player.socketId}')">
                            Kick
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Update round info
    const roundStatus = state.currentRound?.status || 'waiting';
    document.getElementById('roundStatus').textContent = 
        roundStatus.charAt(0).toUpperCase() + roundStatus.slice(1);
    
    const pot = state.currentRound?.pot || 0;
    document.getElementById('totalPot').textContent = pot;

    const activeBets = Object.keys(state.currentRound?.bets || {}).length;
    document.getElementById('activeBets').textContent = activeBets;

    // Update winner selection
    const winnerSelection = document.getElementById('winnerSelection');
    const playersWithBets = state.players?.filter(p => 
        state.currentRound?.bets?.[p.socketId] > 0
    ) || [];

    if (playersWithBets.length === 0) {
        winnerSelection.innerHTML = '<p class="empty-state">No players with active bets</p>';
    } else {
        winnerSelection.innerHTML = playersWithBets.map(player => {
            const bet = state.currentRound.bets[player.socketId];
            return `
                <div class="winner-item">
                    <div>
                        <div class="player-name">${escapeHtml(player.name)}</div>
                        <div class="player-bet">Bet: ${bet} coins</div>
                    </div>
                    <button class="btn-select-winner" onclick="selectWinner('${player.socketId}')">
                        Select Winner
                    </button>
                </div>
            `;
        }).join('');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function onSocketConnect() {
    console.log('Dealer connected to server');
}

function onSocketDisconnect() {
    showError('Disconnected from server. Please refresh the page.');
}

