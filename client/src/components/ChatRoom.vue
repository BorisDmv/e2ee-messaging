<template>
  <div class="chat-box">
    <div class="messages-area">
      <div v-if="!myAESKey" class="waiting-msg">Waiting for another user to join...</div>
      <div v-else class="messages-list" ref="messagesList">
        <div v-for="(msg, idx) in messages" :key="idx" :class="['msg', msg.own ? 'own' : 'peer']">
          <span class="msg-username">{{ msg.own ? 'You' : msg.username }}</span>
          <span>{{ msg.text }}</span>
        </div>
        <div v-if="messages.length === 0" class="empty-msg">No messages yet.</div>
      </div>
    </div>
    <div class="send-area">
      <textarea
        :value="message"
        @input="emit('update:message', $event.target.value)"
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
</template>

<script setup>
import { defineProps, defineEmits, ref, nextTick, watch } from 'vue'
const props = defineProps({
  myAESKey: Object,
  messages: Array,
  message: String,
})
const emit = defineEmits(['update:message', 'sendEncrypted'])
const messagesList = ref(null)

watch(
  () => props.messages.length,
  () => {
    nextTick(() => {
      requestAnimationFrame(() => {
        if (messagesList.value) {
          messagesList.value.scrollTop = messagesList.value.scrollHeight
        }
      })
    })
  },
)

function sendEncrypted() {
  emit('sendEncrypted')
}
</script>

<style scoped>
/* ChatRoom styles */
.chat-box {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 95%;
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
  padding: 0 10px 0 10px;
  font-size: 1rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
  box-shadow: 0 1px 4px #0002;
  flex: 1 1 0;
  overflow-y: auto;
  max-height: none;
  height: 100%;
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
  overflow: auto;
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
</style>
