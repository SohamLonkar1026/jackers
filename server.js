const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Debug route
app.get('/debug', (req, res) => {
  res.json({ status: 'ok' });
});

// In-memory multi-room state
// rooms: roomId -> {
//   password: string,
//   playersByName: Map<name, player>,
//   playersBySocket: Map<socketId, name>,
//   pot: number,
//   moderatorId: string|null,
//   ledger: Map<name, number> // total coins admin has given to each player
// }
const rooms = new Map();

function ensureRoom(roomId, password) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      password,
      adminPassword: null,
      playersByName: new Map(),
      playersBySocket: new Map(),
      pot: 0,
      moderatorId: null,
      ledger: new Map()
    });
  }
  const room = rooms.get(roomId);
  return room;
}

function broadcastGameState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.playersByName.values());
  io.to(roomId).emit('gameState', {
    players,
    pot: room.pot,
    moderatorId: room.moderatorId,
    ledger: Object.fromEntries(room.ledger)
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('--- NEW CONNECTION ---');
  console.log(`Socket ID: ${socket.id}`);

  // Handle player joining
  socket.on('joinRoom', (data) => {
    const { name, initialWallet, isAdmin, roomId, roomPassword, adminPassword } = data || {};
    const normalizedRoomId = String(roomId || '').trim();
    const normalizedPassword = String(roomPassword || '').trim();
    if (!normalizedRoomId || !normalizedPassword) {
      socket.emit('error', { message: 'Room ID and Password required' });
      return;
    }
    const room = ensureRoom(normalizedRoomId, normalizedPassword);
    if (room.password !== normalizedPassword) {
      if (room.playersByName.size === 0) {
        room.password = normalizedPassword;
      } else {
        socket.emit('error', { message: 'Invalid room password' });
        return;
      }
    }
    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;

    const walletInit = parseInt(initialWallet);
    const isModerator = isAdmin === true;
    const playerName = String(name || `Player ${room.playersByName.size + 1}`);

    // Check admin password for admin login
    if (isModerator) {
      if (!adminPassword) {
        socket.emit('error', { message: 'Admin password required' });
        return;
      }
      // If no admin password set yet, set it
      if (!room.adminPassword) {
        room.adminPassword = adminPassword;
      } else if (room.adminPassword !== adminPassword) {
        socket.emit('error', { message: 'Invalid admin password' });
        return;
      }
    }

    let player = room.playersByName.get(playerName);
    if (player) {
      // Reconnect existing player
      player.socketId = socket.id;
      player.online = true;
      room.playersBySocket.set(socket.id, playerName);
      console.log(`Reconnected player ${playerName} to room ${roomId}`);
    } else {
      // New player
      player = {
        socketId: socket.id,
        name: playerName,
        wallet: isNaN(walletInit) ? 1000 : walletInit,
        initialWallet: isNaN(walletInit) ? 1000 : walletInit,
        isModerator: isModerator,
        lastBid: 0,
        totalBid: 0,
        online: true
      };
      room.playersByName.set(playerName, player);
      room.playersBySocket.set(socket.id, playerName);
      if (!room.ledger.has(playerName)) room.ledger.set(playerName, 0);
    }

    // Admin becomes moderator, demote previous
    if (isModerator) {
      if (room.moderatorId) {
        const prevName = room.playersBySocket.get(room.moderatorId);
        if (prevName) {
          const prev = room.playersByName.get(prevName);
          if (prev) prev.isModerator = false;
        }
      }
      room.moderatorId = socket.id;
      player.isModerator = true;
    }

    socket.emit('joined', { 
      player,
      isModerator: player.isModerator 
    });
    broadcastGameState(roomId);
    console.log(`Player joined: ${player.name} (Moderator: ${player.isModerator}) in room ${normalizedRoomId}`);
  });

  // Handle adding money to the pot (betting)
  socket.on('addMoney', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    const playerName = room.playersBySocket.get(socket.id);
    const player = playerName ? room.playersByName.get(playerName) : null;
    if (!player) {
      socket.emit('error', { message: 'Not in game' });
      return;
    }

    const amount = parseInt(data.amount);
    if (isNaN(amount) || amount <= 0) {
      socket.emit('error', { message: 'Invalid amount' });
      return;
    }

    if (amount > player.wallet) {
      socket.emit('error', { message: `Insufficient funds! You only have ₹${player.wallet}` });
      return;
    }

    player.wallet -= amount;
    player.lastBid = amount;
    player.totalBid = (player.totalBid || 0) + amount;
    room.pot += amount;

    io.to(roomId).emit('moneyAdded', {
      socketId: socket.id,
      amount,
      newPot: room.pot
    });

    broadcastGameState(roomId);
    console.log(`${player.name} added ${amount} to pot. New wallet: ${player.wallet}, New pot: ${room.pot} [room ${roomId}]`);
  });

  // Handle winner selection (Moderator only)
  socket.on('selectWinner', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.moderatorId) {
      socket.emit('error', { message: 'Only Moderator can select winner' });
      return;
    }

    const winnerSocketId = data.winnerSocketId;
    let winnerName = room.playersBySocket.get(winnerSocketId);
    let winner = winnerName ? room.playersByName.get(winnerName) : null;
    
    // If winner not found by socket ID (might be disconnected), try by name
    if (!winner && data.winnerName) {
      winnerName = data.winnerName;
      winner = room.playersByName.get(winnerName);
    }
    
    if (!winner) {
      socket.emit('error', { message: 'Winner not found' });
      return;
    }

    const winAmount = room.pot;
    winner.wallet += winAmount;
    
    io.to(roomId).emit('winnerSelected', {
      winnerSocketId,
      winnerName: winner.name,
      amount: winAmount
    });

    room.pot = 0;
    room.playersByName.forEach(p => {
      p.lastBid = 0;
      p.totalBid = 0;
    });
    
    broadcastGameState(roomId);
    console.log(`Winner selected: ${winner.name}, won ${winAmount} [room ${roomId}]`);
  });

  // Handle manual wallet adjustment (Moderator only)
  socket.on('adjustWallet', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.moderatorId) {
      socket.emit('error', { message: 'Only Moderator can adjust wallets' });
      return;
    }

    // Try to find player by socket ID first, then by name if socket is disconnected
    let targetPlayer = null;
    const targetName = room.playersBySocket.get(data.playerSocketId);
    
    if (targetName) {
      targetPlayer = room.playersByName.get(targetName);
    } else {
      // Player might be disconnected, try to find by name if provided
      if (data.playerName) {
        targetPlayer = room.playersByName.get(data.playerName);
      }
    }
    
    if (!targetPlayer) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }

    const adjustment = parseInt(data.amount);
    if (isNaN(adjustment)) return;

    targetPlayer.wallet += adjustment;
    room.ledger.set(targetPlayer.name, (room.ledger.get(targetPlayer.name) || 0) + adjustment);
    broadcastGameState(roomId);
  });

  // Handle resetting the pool (Moderator only)
  socket.on('resetPool', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.moderatorId) {
      socket.emit('error', { message: 'Only Moderator can reset the pool' });
      return;
    }
    room.pot = 0;
    room.playersByName.forEach(p => {
      p.lastBid = 0;
      p.totalBid = 0;
    });
    io.to(roomId).emit('poolReset');
    broadcastGameState(roomId);
    console.log('Pool reset by moderator [room ' + roomId + ']');
  });

  // Handle full room reset (Moderator only)
  socket.on('resetRoom', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.moderatorId) {
      socket.emit('error', { message: 'Only Moderator can reset the room' });
      return;
    }
    room.pot = 0;
    room.playersByName.forEach(p => {
      p.wallet = p.initialWallet;
      p.lastBid = 0;
      p.totalBid = 0;
    });
    room.ledger = new Map();
    io.to(roomId).emit('roomReset');
    broadcastGameState(roomId);
    console.log('Room fully reset [room ' + roomId + ']');
  });

  // Handle settlement broadcast (Moderator only)
  socket.on('showSettlementToAll', (settlements) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.moderatorId) {
      socket.emit('error', { message: 'Only Moderator can show settlement' });
      return;
    }
    io.to(roomId).emit('showSettlementToAll', settlements);
    console.log('Settlement shown to all players [room ' + roomId + ']');
  });

  // Handle direct pool adjustment (Moderator only)
  socket.on('adjustPool', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id !== room.moderatorId) {
      socket.emit('error', { message: 'Only Moderator can adjust the pool directly' });
      return;
    }
    const amount = parseInt(data.amount);
    if (isNaN(amount)) return;
    room.pot += amount;
    if (room.pot < 0) room.pot = 0;
    broadcastGameState(roomId);
    console.log(`Pool adjusted by ${amount}. New pool: ${room.pot} [room ${roomId}]`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    const playerName = room.playersBySocket.get(socket.id);
    if (playerName) {
      const player = room.playersByName.get(playerName);
      room.playersBySocket.delete(socket.id);
      if (player) {
        player.online = false; // persist player data
      }
      if (socket.id === room.moderatorId) {
        room.moderatorId = null;
        console.log(`Moderator disconnected. Room ${roomId} is now without a moderator.`);
      }
      console.log(`Player disconnected: ${playerName} [room ${roomId}]`);
      broadcastGameState(roomId);
    }
  });

  // Send current game state to newly connected client
  socket.on('requestState', () => {
    const roomId = socket.data.roomId;
    broadcastGameState(roomId);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`========================================\n`);
  console.log('To find your laptop IP address:');
  console.log('Windows: ipconfig (look for IPv4 Address)');
  console.log('Mac/Linux: ifconfig or ip addr');
  console.log('\nPlayers should connect to: http://<your-ip>:3000\n');
});

