const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const msg = JSON.parse(data);

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
