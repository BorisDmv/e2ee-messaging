const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });


const rooms = {};

// Simple in-memory rate limiting per connection
const RATE_LIMIT_WINDOW = 3000; // ms
const RATE_LIMIT_MAX = 8; // max messages per window

function rateLimit(ws) {
    if (!ws._rateLimit) {
        ws._rateLimit = { count: 0, last: Date.now() };
    }
    const now = Date.now();
    if (now - ws._rateLimit.last > RATE_LIMIT_WINDOW) {
        ws._rateLimit.count = 0;
        ws._rateLimit.last = now;
    }
    ws._rateLimit.count++;
    if (ws._rateLimit.count > RATE_LIMIT_MAX) {
        return false;
    }
    return true;
}

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        if (!rateLimit(ws)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded. Please slow down.' }));
            return;
        }
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        switch (msg.type) {
            case 'create_room':
                rooms[msg.room] = { password: msg.password, users: [ws] };
                ws.room = msg.room;
                // Send confirmation to creator
                ws.send(JSON.stringify({ type: 'room_created' }));
                break;

            case 'join_room':
                const room = rooms[msg.room];
                if (room && room.password === msg.password) {
                    room.users.push(ws);
                    ws.room = msg.room;
                    room.users.forEach(user => {
                        if (user !== ws) {
                            user.send(JSON.stringify({ type: 'user_joined' }));
                        }
                    });
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room or password' }));
                }
                break;

            case 'public_key':
            case 'encrypted_message':
                rooms[ws.room]?.users.forEach(user => {
                    if (user !== ws) {
                        user.send(JSON.stringify(msg));
                    }
                });
                break;
        }
    });
});
