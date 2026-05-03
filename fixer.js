const fs = require('fs');
let content = fs.readFileSync('public/css/style.css');
// Convert buffer to string properly, ignoring NUL bytes
// The >> redirected in UTF-16LE, so we might have some mixed encoding.
// Let's just find the form-group label end "}"
let str = content.toString('utf8').replace(/\0/g, '');
let index = str.indexOf('@ m e d i a');
if (index === -1) index = str.indexOf('@media');
if (index !== -1) {
    str = str.substring(0, index);
} else {
    // maybe we just look for the form-group label closing brace
    let fgIdx = str.lastIndexOf('.form-group label');
    let closeIdx = str.indexOf('}', fgIdx);
    str = str.substring(0, closeIdx + 1);
}

str += `

@media (max-width: 650px) {
    .login-card {
        width: 90vw;
        padding: 18px 20px;
    }
    .login-card-inner {
        flex-direction: column;
        gap: 16px;
    }
    .login-divider {
        display: none;
    }
    .login-form-area {
        width: 100%;
    }
    .login-card .room-details {
        flex-direction: column;
        gap: 0;
    }
    .login-card input[type="text"],
    .login-card input[type="password"] {
        font-size: 16px;
        padding: 12px 14px;
    }
    .login-card .btn-join {
        padding: 14px;
        font-size: 1.1em;
    }
}
`;

fs.writeFileSync('public/css/style.css', str, 'utf8');
console.log("File fixed successfully");
