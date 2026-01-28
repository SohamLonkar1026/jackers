const socket = initSocket();
let myId = null;
let isModerator = false;
let players = [];
let pot = 0;

// Initialize when socket connects
function onSocketConnect() {
    console.log('onSocketConnect triggered, socket.id:', socket.id);
    const name = sessionStorage.getItem('playerName');
    const initialWallet = sessionStorage.getItem('initialWallet');
    
    if (!name) {
        console.warn('No player name found in sessionStorage, redirecting to join page...');
        window.location.href = 'index.html';
        return;
    }

    console.log('Emitting joinRoom for:', name, 'with wallet:', initialWallet);
    socket.emit('joinRoom', { name, initialWallet });
}

// If already connected by the time this script runs
if (socket.connected) {
    onSocketConnect();
}

socket.on('joined', (data) => {
    console.log('Joined event received:', data);
    myId = data.player.socketId;
    isModerator = data.isModerator;
    updateMyInfo(data.player);
    document.getElementById('connection-status').style.color = '#00ff00';
});

socket.on('disconnect', () => {
    document.getElementById('connection-status').style.color = '#ff4444';
});

socket.on('gameState', (state) => {
    console.log('GameState received:', state);
    players = state.players;
    pot = state.pot;
    
    // Always use current socket.id as fallback for myId
    if (!myId && socket.id) {
        myId = socket.id;
        console.log('Setting myId from socket.id:', myId);
    }

    // Update table and pot regardless
    updateTable();
    updatePot();
    updateModeratorControls();

    // Try to find myself in the player list to update my info
    const me = players.find(p => p.socketId === myId);
    if (me) {
        console.log('Found myself in player list:', me);
        isModerator = me.isModerator;
        updateMyInfo(me);
        document.getElementById('connection-status').style.color = '#00ff00';
    } else {
        // If I'm not in the list yet, I might need to (re)join
        console.log('I am not in the player list yet. Current players:', players.map(p => p.socketId));
        if (socket.connected && !myId) {
            console.log('Socket connected but no myId, trying to join...');
            onSocketConnect();
        }
    }
});

socket.on('moneyAdded', (data) => {
    animateCoin(data.socketId, data.amount);
});

socket.on('winnerSelected', (data) => {
    alert(`${data.winnerName} won ₹${data.amount}!`);
});

function updateMyInfo(player) {
    document.getElementById('my-name').textContent = player.name + (player.isModerator ? ' (Mod)' : '');
    document.getElementById('my-wallet').textContent = `Wallet: ₹${player.wallet}`;
}

function updatePot() {
    document.getElementById('pot-display').textContent = `₹${pot}`;
}

function updateTable() {
    const table = document.getElementById('poker-table');
    // Remove existing slots except the pole
    const slots = table.querySelectorAll('.player-slot');
    slots.forEach(s => s.remove());

    const radius = table.offsetWidth / 2 - 60;
    const centerX = table.offsetWidth / 2;
    const centerY = table.offsetHeight / 2;

    players.forEach((player, index) => {
        const angle = (index / players.length) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle) - 40;
        const y = centerY + radius * Math.sin(angle) - 40;

        const slot = document.createElement('div');
        slot.className = 'player-slot';
        slot.id = `player-slot-${player.socketId}`;
        slot.style.left = `${x}px`;
        slot.style.top = `${y}px`;

        slot.innerHTML = `
            <div class="player-icon">${player.isModerator ? '👑' : '👤'}</div>
            <div class="player-name-label">${player.name}</div>
            <div class="player-wallet-label">₹${player.wallet}</div>
        `;

        table.appendChild(slot);
    });
}

function updateModeratorControls() {
    const modControls = document.getElementById('moderator-controls');
    const winnerBtns = document.getElementById('winner-buttons');
    
    if (isModerator) {
        modControls.classList.add('active');
        winnerBtns.innerHTML = '';
        
        players.forEach(player => {
            const btn = document.createElement('button');
            btn.className = 'btn-winner';
            btn.textContent = `Winner: ${player.name}`;
            btn.onclick = () => selectWinner(player.socketId);
            winnerBtns.appendChild(btn);
        });
    } else {
        modControls.classList.remove('active');
    }
}

function handleAddMoney() {
    const input = document.getElementById('add-money-input');
    const amount = parseInt(input.value);
    
    if (isNaN(amount) || amount <= 0) {
        showError('Please enter a valid amount');
        return;
    }

    socket.emit('addMoney', { amount });
    input.value = '';
}

function selectWinner(winnerSocketId) {
    if (confirm('Are you sure you want to give the pot to this player?')) {
        socket.emit('selectWinner', { winnerSocketId });
    }
}

function animateCoin(fromSocketId, amount) {
    const slot = document.getElementById(`player-slot-${fromSocketId}`);
    const potElement = document.getElementById('pot-pole');
    
    if (!slot || !potElement) return;

    const coin = document.createElement('div');
    coin.className = 'coin';
    coin.textContent = `₹${amount}`;
    
    // Get positions
    const slotRect = slot.getBoundingClientRect();
    const potRect = potElement.getBoundingClientRect();
    
    coin.style.left = `${slotRect.left + slotRect.width/2 - 15}px`;
    coin.style.top = `${slotRect.top + slotRect.height/2 - 15}px`;
    
    document.body.appendChild(coin);

    // Trigger animation
    setTimeout(() => {
        coin.style.transform = `translate(${potRect.left - slotRect.left}px, ${potRect.top - slotRect.top}px) scale(0.5)`;
        coin.style.opacity = '0';
    }, 50);

    // Remove after animation
    setTimeout(() => {
        coin.remove();
    }, 1000);
}