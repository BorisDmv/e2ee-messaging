# E2EE Messaging

A modern, end-to-end encrypted (E2EE) chat application built with Vue 3 (Vite) for the client and Node.js (WebSocket) for the server. Features a glassmorphic, responsive UI and robust UX for secure, real-time messaging.

## Features

- End-to-end encryption using RSA and AES (Web Crypto API)
- Join or create chat rooms (room names are case-insensitive)
- Modern, glassmorphic, mobile-friendly UI
- Real-time messaging with WebSockets
- Robust error and timeout handling for connection and room join/create
- Dark and light mode toggle
- Rate limiting to prevent spam

## Project Structure

```
client/           # Vue 3 + Vite frontend
  src/
    components/   # Vue components (ChatRoom, JoinRoom, etc.)
    views/        # Main ChatView
    ...
  public/
  index.html
  package.json
  vite.config.js

server/           # Node.js WebSocket backend
  index.js        # WebSocket server logic
  package.json
```

## Getting Started

### Prerequisites
- Node.js 18+

### Setup

#### 1. Install dependencies

```
cd server
npm install
cd ../client
npm install
```

#### 2. Start the server

```
cd ../server
node index.js
```

The server will listen on `ws://localhost:8080` by default.

#### 3. Start the client

```
cd ../client
npm run dev
```

The client will be available at `http://localhost:5173` (or as shown in your terminal).

#### 4. Configure WebSocket URL (optional)

To use a different WebSocket server URL, set `VITE_WS_URL` in `client/.env`:

```
VITE_WS_URL=ws://your-server:8080/
```

## Usage

- Enter your name, room name, and password to join or create a room.
- Share the room name and password with others to chat securely.
- All messages are encrypted end-to-end in the browser.

## Security Notes
- Encryption uses RSA-OAEP for key exchange and AES-GCM for message encryption.
- Room names are case-insensitive and passwords are required for access.
- All cryptography is performed client-side using the Web Crypto API.

## Development
- Client: Vue 3, Vite, Composition API, scoped CSS
- Server: Node.js, ws

## License
MIT
