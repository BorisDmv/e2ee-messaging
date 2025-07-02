<template>
  <div>
    <!-- Add blurred background circles -->
    <div class="background-circles">
      <div class="circle circle1"></div>
      <div class="circle circle2"></div>
      <div class="circle circle3"></div>
    </div>
    <div class="chat-container" ref="chatContainer">
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
            >
              Send
            </button>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

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

const chatContainer = ref(null)

// Mobile keyboard UX fix: scroll chat to bottom and adjust height on resize
function scrollToBottom() {
  nextTick(() => {
    const area = document.querySelector('.messages-area')
    if (area) area.scrollTop = area.scrollHeight
  })
}

function handleResize() {
  // On mobile, when keyboard opens, window.innerHeight shrinks
  if (chatContainer.value) {
    chatContainer.value.style.maxHeight = window.innerHeight + 'px'
  }
  scrollToBottom()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

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
  scrollToBottom()
}
</script>

<style scoped>
body,
html {
  height: 100%;
  margin: 0;
  padding: 0;
  background: linear-gradient(135deg, #181c24 0%, #23272f 100%);
  min-height: 100vh;
  position: relative;
  overflow: hidden;
}
.background-circles {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}
.circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.5;
}
.circle1 {
  width: 420px;
  height: 420px;
  background: #42b983;
  left: -120px;
  top: 10vh;
}
.circle2 {
  width: 320px;
  height: 320px;
  background: #2c3e50;
  right: -100px;
  top: 40vh;
}
.circle3 {
  width: 180px;
  height: 180px;
  background: #fff;
  left: 60vw;
  top: 80vh;
  opacity: 0.12;
}
#app {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.chat-container {
  max-width: 420px;
  margin: 60px auto;
  background: rgba(30, 34, 44, 0.7);
  border-radius: 22px;
  box-shadow: 0 8px 32px 0 #0006;
  padding: 36px 28px 28px 28px;
  font-family: 'Segoe UI', Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 540px;
  backdrop-filter: blur(18px) saturate(1.2);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  z-index: 2;
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
  width: 100%;
  margin-top: auto;
}
.input {
  padding: 12px 16px;
  border: 1.5px solid #23272f;
  border-radius: 10px;
  font-size: 1.08rem;
  outline: none;
  transition:
    border 0.2s,
    box-shadow 0.2s;
  background: #23272f;
  color: #fff;
  box-shadow: 0 1px 2px #0002;
}
.input:focus {
  border-color: #42b983;
  box-shadow: 0 2px 8px #42b98322;
}
.join-btn {
  background: linear-gradient(90deg, #42b983 60%, #2c3e50 100%);
  color: #fff;
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
  margin-bottom: 0;
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
  background: rgba(36, 40, 54, 0.85);
  border-radius: 12px;
  margin-bottom: 10px;
  padding: 16px 10px 10px 10px;
  font-size: 1rem;
  color: #e0eafc;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
  overflow-y: auto;
  box-shadow: 0 1px 4px #0002;
  flex: 1 1 0;
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
  background: rgba(66, 185, 131, 0.1);
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 1px 4px #42b98311;
  position: relative;
  color: #e0eafc;
}
.msg-username {
  font-size: 0.92em;
  color: #42b983;
  font-weight: 600;
  margin-bottom: 2px;
  letter-spacing: 0.5px;
}
.msg.own .msg-username {
  color: #fff;
}
.msg.own {
  background: rgba(180, 180, 180, 0.18); /* semi-transparent grey */
  color: #fff;
  align-self: flex-end;
  box-shadow: 0 2px 8px #b4b4b422;
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
  margin-bottom: 0;
}
.message-input {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  border: 1.5px solid #23272f;
  padding: 12px 16px;
  font-size: 1.08rem;
  resize: none;
  background: #23272f;
  color: #fff;
  box-shadow: 0 1px 2px #0002;
  transition:
    border 0.2s,
    box-shadow 0.2s;
}
.message-input:focus {
  border-color: #42b983;
  box-shadow: 0 2px 8px #42b98322;
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
