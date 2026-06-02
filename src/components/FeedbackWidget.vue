<script setup lang="ts">
import { ref } from 'vue'

type Status = 'idle' | 'open' | 'sending' | 'sent' | 'error'

const status = ref<Status>('idle')
const message = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

const FEEDBACK_URL = (import.meta.env.VITE_FEEDBACK_API_URL as string ?? 'https://babadeluxe.com') + '/api/feedback'

async function submit() {
  if (!message.value.trim()) return
  status.value = 'sending'
  try {
    const res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.value.trim(), source: 'webview' }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    status.value = 'sent'
    message.value = ''
  } catch {
    status.value = 'error'
  }
}
</script>

<template>
  <!-- Trigger button -->
  <button
    v-if="status === 'idle'"
    type="button"
    aria-label="Send feedback"
    class="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
    @click="status = 'open'"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  </button>

  <!-- Panel -->
  <div
    v-else
    role="dialog"
    aria-label="Feedback"
    class="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-border bg-surface shadow-xl"
  >
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <span class="text-sm font-semibold text-text">Send feedback</span>
      <button type="button" aria-label="Close" class="p-1 text-muted transition-colors hover:text-text" @click="status = 'idle'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div class="p-4">
      <!-- Success -->
      <div v-if="status === 'sent'" class="flex flex-col items-center gap-2 py-6 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-success" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <p class="text-sm font-medium text-text">Thanks! Got it.</p>
        <button type="button" class="mt-1 text-xs text-muted underline-offset-2 hover:underline" @click="status = 'idle'">Close</button>
      </div>

      <!-- Form -->
      <form v-else @submit.prevent="submit" class="flex flex-col gap-3">
        <label for="fb-msg" class="sr-only">Your feedback</label>
        <textarea
          id="fb-msg"
          ref="textarea"
          v-model="message"
          placeholder="What's on your mind?"
          rows="4"
          :disabled="status === 'sending'"
          class="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <p v-if="status === 'error'" role="alert" class="text-xs text-destructive">Something went wrong. Try again.</p>
        <button
          type="submit"
          :disabled="status === 'sending' || !message.trim()"
          class="self-end rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {{ status === 'sending' ? 'Sending…' : 'Send' }}
        </button>
      </form>
    </div>
  </div>
</template>
