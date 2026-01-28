# LAN Multiplayer Game Manager

A local-LAN multiplayer web application for managing game money in **Blackjack** and **Teen Patti**. Runs entirely on your laptop as a local server, allowing multiple mobile devices to connect simultaneously using the laptop's local IP address. Works completely offline - no internet or hosting required.

## Features

- 🎮 **Two Game Modes**: Blackjack and Teen Patti
- 👑 **Dealer Dashboard**: Manage players, wallets, bets, and game rounds
- 👤 **Player Interface**: Join games, place bets, view wallet balance
- 🔄 **Real-time Sync**: Instant updates via WebSockets (Socket.IO)
- 💾 **In-Memory Storage**: No database required - all state in memory
- 🌐 **LAN-Only**: Works on local network without internet

## Requirements

- Node.js (v14 or higher)
- Laptop with Wi-Fi/hotspot capability
- Mobile devices on the same network

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

## How to Start

### 1. Start the Server

On your laptop, run:
```bash
npm start
```

The server will start on `http://localhost:3000`

### 2. Find Your Laptop's IP Address

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually Wi-Fi or Ethernet).

**Mac/Linux:**
```bash
ifconfig
```
or
```bash
ip addr
```
Look for the IP address (usually starts with 192.168.x.x or 10.0.x.x).

### 3. Connect Devices

**Dealer (Laptop):**
- Open browser: `http://localhost:3000`

**Players (Mobile Devices):**
- Connect to the same Wi-Fi/hotspot as your laptop
- Open browser: `http://<your-laptop-ip>:3000`
  - Example: `http://192.168.1.100:3000`

## Usage Guide

### For the Dealer

1. **Open the app** on your laptop at `http://localhost:3000`
2. **Select a game** (Blackjack or Teen Patti)
3. **Click "I am the Dealer"**
4. **Enter your name** (e.g., "Soham")
5. **Select the game type** from the dashboard
6. **Wait for players** to join
7. **Start a round** when ready
8. **Monitor bets** as players place them
9. **Select winners** after the round
10. **Manage wallets** - adjust balances, kick players, reset rounds

### For Players

1. **Open the app** on your mobile device using the laptop's IP address
2. **Select the same game** as the dealer
3. **Click "I am a Player"**
4. **Enter your name**
5. **Wait for dealer** to start a round
6. **Place your bet** when the round is active
7. **View your wallet** balance and bet status
8. **Wait for results** - dealer will select winners

## Game Rules

### Blackjack
- Players place bets before the round starts
- Cards are dealt manually in real life
- Dealer selects winner(s)
- **Winner**: Gets 2× their bet amount
- **Loser**: Loses their bet amount (already deducted when placing bet)

### Teen Patti
- Turn-by-turn betting system
- All bets go into a shared pot
- Dealer selects winner
- **Winner**: Gets the entire pot
- **Losers**: Lose their bet amount (already deducted when placing bet)

## Dealer Controls

- **Set Game Type**: Choose between Blackjack and Teen Patti
- **Start Round**: Begin a new betting round
- **End Round**: Mark the current round as ended
- **Select Winner**: Choose which player won the round
- **Adjust Wallet**: Manually add or subtract coins from any player's wallet
- **Kick Player**: Remove a player from the game
- **Reset Round**: Clear all bets and reset the current round
- **Reset Full Game**: Clear all players and start fresh

## Technical Details

- **Backend**: Node.js + Express
- **Real-time**: Socket.IO (WebSockets)
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Storage**: In-memory only (no database)
- **Port**: 3000 (default)

## Network Configuration

### If Players Can't Connect

1. **Check Firewall**: Make sure port 3000 is not blocked
   - Windows: Allow Node.js through Windows Firewall
   - Mac: System Preferences → Security & Privacy → Firewall

2. **Verify IP Address**: Ensure you're using the correct IP address
   - The IP should be from the same network adapter that mobile devices are connected to

3. **Check Network**: Ensure all devices are on the same Wi-Fi/hotspot

4. **Try Different Browser**: Some browsers may have restrictions

## Troubleshooting

**Server won't start:**
- Check if port 3000 is already in use
- Try a different port (modify `PORT` in `server.js`)

**Players can't connect:**
- Verify laptop and mobile devices are on the same network
- Check firewall settings
- Ensure you're using the correct IP address

**WebSocket connection fails:**
- Check browser console for errors
- Verify Socket.IO is loading correctly
- Try refreshing the page

## Project Structure

```
.
├── server.js              # Express + Socket.IO server
├── package.json           # Dependencies
├── README.md             # This file
└── public/
    ├── index.html        # Landing page (game selection)
    ├── role-select.html  # Role selection page
    ├── dealer.html       # Dealer dashboard
    ├── player.html       # Player interface
    ├── css/
    │   └── style.css     # All styling
    └── js/
        ├── socket.js     # Shared Socket.IO connection
        ├── dealer.js     # Dealer-specific logic
        └── player.js     # Player-specific logic
```

## Notes

- All game state is stored in memory - restarting the server will reset everything
- The app works completely offline - no internet connection required
- Multiple players can connect simultaneously
- Real-time updates happen instantly via WebSockets
- Wallet balances cannot go negative unless dealer explicitly allows it

## License

ISC

---

**Enjoy your local multiplayer gaming sessions!** 🎮

