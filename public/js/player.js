// Player-specific Socket.IO handling and UI logic

let playerName = '';
let playerWallet = 1000;
let currentGameState = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    
    socket.on('gameState', (state) => {
        currentGameState = state;
        updatePlayerUI(state);
    });

    socket.on('playerConfirmed', (data) => {
        playerName = data.name;
        playerWallet = data.wallet;
        document.getElementById('playerNameDisplay').textContent = playerName;
        document.getElementById('playerLogin').style.display = 'none';
        document.getElementById('playerDashboard').style.display = 'block';
        updateWalletDisplay();
    });

    socket.on('betPlaced', (data) => {
        playerWallet = data.wallet;
        updateWalletDisplay();
        showSuccess('Bet placed successfully!');
    });

    socket.on('kicked', (data) => {
        document.getElementById('playerDashboard').style.display = 'none';
        document.getElementById('kickedMessage').style.display = 'block';
        socket.disconnect();
    });
});

function joinAsPlayer() {
    const nameInput = document.getElementById('playerNameInput');
    const name = nameInput.value.trim();
    
    if (!name) {
        showError('Please enter your name');
        return;
    }

    socket.emit('playerJoin', { name: name });
}

function placeBet() {
    const betInput = document.getElementById('betAmount');
    const betAmount = parseInt(betInput.value);

    if (isNaN(betAmount) || betAmount <= 0) {
        showError('Please enter a valid bet amount');
        return;
    }

    if (betAmount > playerWallet) {
        showError('Insufficient funds');
        return;
    }

    if (!currentGameState || currentGameState.currentRound?.status !== 'active') {
        showError('Round is not active. Please wait for dealer to start the round.');
        return;
    }

    socket.emit('placeBet', { amount: betAmount });
    betInput.value = '';
}

function setBetAmount(amount) {
    document.getElementById('betAmount').value = amount;
}

function updatePlayerUI(state) {
    if (!state) return;

    // Update game type
    if (state.gameType) {
        const gameTypeDisplay = state.gameType === 'blackjack' ? '🃏 Blackjack' : '🎴 Teen Patti';
        document.getElementById('gameTypeDisplay').textContent = gameTypeDisplay;
    } else {
        document.getElementById('gameTypeDisplay').textContent = '-';
    }

    // Update round status
    const roundStatus = state.currentRound?.status || 'waiting';
    document.getElementById('roundStatusDisplay').textContent = 
        roundStatus.charAt(0).toUpperCase() + roundStatus.slice(1);

    // Update current bet
    const myBet = state.currentRound?.bets?.[socket.id] || 0;
    document.getElementById('currentBet').textContent = myBet;

    // Update wallet from server state
    const myPlayer = state.players?.find(p => p.socketId === socket.id);
    if (myPlayer) {
        playerWallet = myPlayer.wallet;
        updateWalletDisplay();
    }

    // Enable/disable bet button based on round status
    const betButton = document.getElementById('betButton');
    if (roundStatus === 'active') {
        betButton.disabled = false;
        betButton.textContent = 'Place Bet';
    } else {
        betButton.disabled = true;
        betButton.textContent = roundStatus === 'waiting' ? 'Waiting for round to start' : 'Round ended';
    }
}

function updateWalletDisplay() {
    document.getElementById('walletAmount').textContent = playerWallet;
}

function showSuccess(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.background = '#d4edda';
        errorDiv.style.color = '#155724';
        errorDiv.style.borderColor = '#c3e6cb';
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }
}

function onSocketConnect() {
    console.log('Player connected to server');
    const statusDiv = document.getElementById('connectionStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-indicator connected"></span><span>Connected</span>';
    }
}

function onSocketDisconnect() {
    console.log('Player disconnected from server');
    const statusDiv = document.getElementById('connectionStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-indicator disconnected"></span><span>Disconnected</span>';
    }
    showError('Disconnected from server. Please refresh the page.');
}

