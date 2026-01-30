const { io } = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
    console.log("Connected as tester");
    socket.emit("joinRoom", { name: "TesterPlayer", initialWallet: 5000 });
});

socket.on("joined", (data) => {
    console.log("Joined:", data);
    setTimeout(() => {
        console.log("Bidding 100...");
        socket.emit("addMoney", { amount: 100 });
        
        setTimeout(() => {
            console.log("Bidding 200...");
            socket.emit("addMoney", { amount: 200 });
        }, 1000);
    }, 1000);
});

socket.on("gameState", (state) => {
    const tester = state.players.find(p => p.name === "TesterPlayer");
    if (tester) {
        console.log(`GameState: Tester LastBid = ${tester.lastBid}, TotalBid = ${tester.totalBid}`);
    }
});

setTimeout(() => {
    process.exit(0);
}, 5000);
