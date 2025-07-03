<template>
  <div :class="[isDark ? 'dark-mode' : 'light-mode', 'app-bg']">
    <!-- Add blurred background circles -->
    <div class="background-circles">
      <div class="circle circle1"></div>
      <div class="circle circle2"></div>
      <div class="circle circle3"></div>
    </div>
    <div class="chat-container">
      <button
        class="mode-toggle"
        @click="isDark = !isDark"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <span v-if="isDark">🌙</span>
        <span v-else>☀️</span>
      </button>
      <h2 class="chat-title">🔒 Secure Chat</h2>
      <transition name="fade">
        <form v-if="!connected" class="join-form" @submit.prevent="connect">
          <input v-model="username" placeholder="Your Name" class="input" />
          <input v-model="room" placeholder="Room Name" class="input" />
          <input v-model="password" placeholder="Password" type="password" class="input" />
          <button class="join-btn" type="submit">Join / Create Room</button>
        </form>
      </transition>
      <transition name="fade">
        <div v-if="connected" class="chat-box">
          <div class="messages-area">
            <div v-if="!myAESKey" class="waiting-msg">Waiting for another user to join...</div>
            <div v-else class="messages-list">
              <div
                v-for="(msg, idx) in messages"
                :key="idx"
                :class="['msg', msg.own ? 'own' : 'peer']"
              >
                <span class="msg-username">{{ msg.own ? 'You' : msg.username }}</span>
                <span>{{ msg.text }}</span>
              </div>
              <div v-if="messages.length === 0" class="empty-msg">No messages yet.</div>
            </div>
          </div>
          <div class="send-area">
            <textarea
              v-model="message"
              class="message-input"
              placeholder="Type your message..."
              :disabled="!myAESKey"
            ></textarea>
            <button
              @click="sendEncrypted"
              class="send-btn"
              :disabled="!myAESKey || !message.trim()"
              aria-label="Send"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3 20L21 12L3 4V10L17 12L3 14V20Z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const isDark = ref(false)
const ws = ref(null)
const username = ref('')
const room = ref('')
const password = ref('')
const message = ref('')
const connected = ref(false)

const myAESKey = ref(null)
const messages = ref([])
let myKeyPair
let peerPublicKey

async function generateRSAKeys() {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
}

// Use import.meta.env for Vite environment variables
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/'

async function connect() {
  ws.value = new WebSocket(WS_URL)

  ws.value.onopen = async () => {
    myKeyPair = await generateRSAKeys()
    // Try to join first
    ws.value.send(JSON.stringify({ type: 'join_room', room: room.value, password: password.value }))
  }

  ws.value.onmessage = async (event) => {
    const msg = JSON.parse(event.data)

    if (msg.type === 'user_joined') {
      const publicKey = await crypto.subtle.exportKey('spki', myKeyPair.publicKey)
      ws.value.send(
        JSON.stringify({
          type: 'public_key',
          key: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
        }),
      )
    }

    if (msg.type === 'public_key') {
      const keyBuffer = Uint8Array.from(atob(msg.key), (c) => c.charCodeAt(0)).buffer
      peerPublicKey = await crypto.subtle.importKey(
        'spki',
        keyBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt'],
      )

      // Generate AES key and send it encrypted
      myAESKey.value = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
        'encrypt',
        'decrypt',
      ])
      const aesRaw = await crypto.subtle.exportKey('raw', myAESKey.value)
      const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, peerPublicKey, aesRaw)
      ws.value.send(
        JSON.stringify({
          type: 'encrypted_message',
          message: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
        }),
      )
      connected.value = true
    }

    if (msg.type === 'encrypted_message' && myKeyPair.privateKey) {
      // Try to decrypt as a key exchange first
      try {
        const enc = Uint8Array.from(atob(msg.message), (c) => c.charCodeAt(0))
        const decrypted = await crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          myKeyPair.privateKey,
          enc.buffer,
        )
        // If successful, treat as key exchange
        const rawAES = await crypto.subtle.importKey('raw', decrypted, { name: 'AES-GCM' }, false, [
          'encrypt',
          'decrypt',
        ])
        myAESKey.value = rawAES
      } catch (e) {
        // If decryption fails, treat as a normal message
        if (myAESKey.value) {
          const enc = Uint8Array.from(atob(msg.message), (c) => c.charCodeAt(0))
          const iv = enc.slice(0, 12)
          const data = enc.slice(12)
          try {
            const decrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv },
              myAESKey.value,
              data,
            )
            const text = new TextDecoder().decode(decrypted)
            messages.value.push({
              text,
              own: msg.username === username.value,
              username: msg.username || 'Peer',
            })
          } catch (err) {
            // ignore failed message
          }
        }
      }
    }

    // If error, try to create the room
    if (msg.type === 'error' && msg.message === 'Invalid room or password') {
      ws.value.send(
        JSON.stringify({ type: 'create_room', room: room.value, password: password.value }),
      )
    }

    // Handle room_created confirmation for first user
    if (msg.type === 'room_created') {
      const publicKey = await crypto.subtle.exportKey('spki', myKeyPair.publicKey)
      ws.value.send(
        JSON.stringify({
          type: 'public_key',
          key: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
        }),
      )
      connected.value = true
    }
  }
}

async function sendEncrypted() {
  if (!myAESKey.value) return
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(message.value)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, myAESKey.value, encoded)
  const fullPayload = new Uint8Array([...iv, ...new Uint8Array(encrypted)])
  ws.value.send(
    JSON.stringify({
      type: 'encrypted_message',
      message: btoa(String.fromCharCode(...fullPayload)),
      username: username.value,
    }),
  )
  messages.value.push({ text: message.value, own: true, username: username.value })
  message.value = ''
}
</script>

<style scoped>
.app-bg {
  min-height: 100vh;
  min-width: 100vw;
  height: 100vh;
  width: 100vw;
  position: fixed;
  top: 0;
  left: 0;
  margin: 0;
  padding: 0;
  z-index: 0;
  overflow: hidden;
}

.light-mode.app-bg {
  background: linear-gradient(135deg, #f6f8fa 0%, #eaf6ff 100%);
}
.dark-mode.app-bg {
  background: linear-gradient(135deg, #181c24 0%, #23272f 100%);
}

.mode-toggle {
  position: absolute;
  top: 18px;
  right: 18px;
  background: none;
  border: none;
  font-size: 1.7rem;
  cursor: pointer;
  z-index: 10;
  color: #181c24;
  transition: color 0.2s;
}
.dark-mode .mode-toggle {
  color: #fff;
}

.chat-container {
  max-width: 420px;
  margin: 60px auto;
  background: var(--chat-bg);
  border-radius: 22px;
  box-shadow: 0 8px 32px 0 #0006;
  padding: 0 15px;
  font-family: 'Segoe UI', Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 540px;
  backdrop-filter: blur(18px) saturate(1.2);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  z-index: 2;
  overflow: hidden;
}
.light-mode .chat-container {
  --chat-bg: rgba(255, 255, 255, 0.95);
  border: 1.5px solid #b4b4b4;
}
.dark-mode .chat-container {
  --chat-bg: rgba(30, 34, 44, 0.7);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
}
@media (max-width: 600px) {
  .chat-container {
    min-height: 100vh;
    height: 100dvh;
    max-width: 100vw;
    margin: 0;
    border-radius: 0;
    padding: 0 15px;
    overflow: hidden;
  }
  .join-form {
    flex: 1 1 0;
    justify-content: center;
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-height: 0;
    margin: 0;
    padding: 0 18px;
  }
  .join-form .input {
    width: 94%;
  }
}
.chat-title {
  text-align: center;
  margin-bottom: 28px;
  font-size: 2.2rem;
  color: #fff;
  letter-spacing: 1px;
  font-weight: 700;
  text-shadow: 0 2px 8px #0006;
}
.join-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: stretch;
  width: 95%;
  margin-top: auto;
}
.input {
  padding: 12px 12px;
  border: 1.5px solid #23272f;
  border-radius: 10px;
  font-size: 1.08rem;
  outline: none;
  transition:
    border 0.2s,
    box-shadow 0.2s;
  background: #fff;
  color: #181c24;
  box-shadow: 0 1px 2px #0002;
}
.input:focus {
  border-color: #42b983;
  box-shadow: 0 2px 8px #42b98322;
}
.dark-mode .input {
  background: #23272f;
  color: #fff;
  border: 1.5px solid #23272f;
}
.join-btn {
  background: linear-gradient(90deg, #42b983 60%, #eaf6ff 100%);
  color: #181c24;
  border: none;
  border-radius: 10px;
  padding: 14px 0;
  font-size: 1.15rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 2px 8px #42b98322;
  margin-bottom: 12px;
}
.dark-mode .join-btn {
  background: linear-gradient(90deg, #42b983 60%, #2c3e50 100%);
  color: #fff;
}
.join-btn:hover {
  background: linear-gradient(90deg, #2c3e50 60%, #42b983 100%);
  box-shadow: 0 4px 16px #2c3e5022;
}
.chat-box {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  height: 100%;
  flex: 1 1 0;
}
.messages-area {
  min-height: 160px;
  background: #fff;
  color: #181c24;
  border: 1.5px solid #42b983;
  border-radius: 12px;
  margin-bottom: 24px;
  padding: 16px 10px 10px 10px;
  font-size: 1rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
  overflow-y: auto;
  box-shadow: 0 1px 4px #0002;
  flex: 1 1 0;
}
.dark-mode .messages-area {
  background: rgba(36, 40, 54, 0.85);
  color: #e0eafc;
  border: 1.5px solid #23272f;
}
.messages-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  padding: 10px 16px 8px 16px;
  border-radius: 12px;
  max-width: 80%;
  word-break: break-word;
  font-size: 1.05rem;
  background: #eafcf6;
  color: #181c24;
  border: 1.5px solid #42b983;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 1px 4px #42b98311;
  position: relative;
}
.dark-mode .msg {
  background: rgba(66, 185, 131, 0.1);
  color: #e0eafc;
  border: 1.5px solid #42b983;
}
.msg.own {
  background: #23272f;
  color: #fff;
  border: 2px solid #42b983;
}
.dark-mode .msg.own {
  background: rgba(180, 180, 180, 0.18);
  color: #fff;
  border: 2px solid #42b983;
}
.msg-username {
  color: #1a7f5a;
}
.dark-mode .msg-username {
  color: #42b983;
}
.msg.own .msg-username {
  color: #fff;
}
.empty-msg {
  color: #aaa;
  text-align: center;
  font-size: 1rem;
  margin-top: 18px;
}
.waiting-msg {
  color: #888;
  font-size: 1.1rem;
  text-align: center;
  width: 100%;
  padding: 18px 0 0 0;
}
.send-area {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  margin-bottom: 24px;
}
.message-input {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  border: 1.5px solid #42b983;
  padding: 12px 16px;
  font-size: 1.08rem;
  resize: none;
  background: #fff;
  color: #181c24;
  box-shadow: 0 1px 2px #0002;
  transition:
    border 0.2s,
    box-shadow 0.2s;
}
.message-input:focus {
  border-color: #42b983;
  box-shadow: 0 2px 8px #42b98322;
}
.dark-mode .message-input {
  background: #23272f;
  color: #fff;
  border: 1.5px solid #23272f;
}
.send-btn {
  background: #42b983;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0 22px;
  font-size: 1.08rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 2px 8px #42b98322;
}
.send-btn:hover {
  background: #2c3e50;
  box-shadow: 0 4px 16px #2c3e5022;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
