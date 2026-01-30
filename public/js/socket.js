// Shared Socket.IO connection
let socket = null;

function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server, socket ID:', socket.id);
        if (typeof onSocketConnect === 'function') {
            onSocketConnect();
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        showError('Failed to connect to server: ' + err.message);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (typeof onSocketDisconnect === 'function') {
            onSocketDisconnect();
        }
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data);
        showError(data.message || 'An error occurred');
    });

    return socket;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

