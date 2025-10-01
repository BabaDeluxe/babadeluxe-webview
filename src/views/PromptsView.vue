<template>
<div class="flex flex-col h-screen p-4 gap-4 bg-slate">
  <div class="flex-1 overflow-auto rounded-md bg-panel shadow box-border p-2">
    <div v-for="(msg, idx) in messages" :key="idx" class="mb-2 text-left">
      <span class="text-sm text-gray-700">{{ msg }}</span>
    </div>
  </div>
  <form class="flex gap-2" @submit.prevent="onSend">
    <input v-model="input" type="text" placeholder="Type your message..."
      class="flex-1 bg-white border border-gray-300 rounded-md px-3 py-2 text-base outline-none focus:(border-blue-400 ring-2 ring-blue-200)"
      autocomplete="off" />
    <button type="submit"
      class="bg-blue-500 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-600 active:bg-blue-700 transition">
      Send
    </button>
  </form>
</div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'

export default defineComponent({
  name: 'PromptsView',
  setup() {
    const messages = ref<string[]>(['How can I help you today?'])
    const input = ref<string>('')

    const onSend = () => {
      input.value = ''
      // No logic attached currently
    }

    return { messages, input, onSend }
  },
})
</script>
