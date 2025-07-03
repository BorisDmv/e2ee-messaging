<template>
  <form class="join-form" @submit.prevent="onSubmit">
    <input
      :value="username"
      @input="emit('update:username', $event.target.value)"
      placeholder="Your Name"
      class="input"
      :disabled="isLoading"
    />
    <input
      :value="room"
      @input="emit('update:room', $event.target.value)"
      placeholder="Room Name"
      class="input"
      :disabled="isLoading"
    />
    <input
      :value="password"
      @input="emit('update:password', $event.target.value)"
      placeholder="Password"
      type="password"
      class="input"
      :disabled="isLoading"
    />
    <button class="join-btn" type="submit" :disabled="isLoading">
      <span v-if="isLoading" class="loader"></span>
      <span v-else>Join / Create Room</span>
    </button>
  </form>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
const props = defineProps({
  username: String,
  room: String,
  password: String,
  isLoading: Boolean,
})
const emit = defineEmits(['update:username', 'update:room', 'update:password', 'submit'])

function onSubmit() {
  emit('submit')
}
</script>

<style scoped>
/* Loader spinner for join/create button */
.loader {
  display: inline-block;
  width: 22px;
  height: 22px;
  border: 3px solid #42b983;
  border-radius: 50%;
  border-top: 3px solid #eaf6ff;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* JoinRoom styles */
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
@media (max-width: 600px) {
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
</style>
