<script setup lang="ts">
import {ref, nextTick} from 'vue'

type Status = 'idle' | 'open' | 'sending' | 'sent' | 'error'

const status = ref<Status>('idle')
const message = ref('')
const textareaEl = ref<HTMLTextAreaElement | null>(null)

async function openWidget() {
  status.value = 'open'
  await nextTick()
  textareaEl.value?.focus()
}

async function handleSubmit() {
  if (!message.value.trim()) return
  status.value = 'sending'
  try {
    const res = await fetch(
      `${import.meta.env.VITE_FEEDBACK_API_URL ?? ''}/api/feedback`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: message.value.trim(), source: 'webview'}),
      },
    )
    if (!res.ok) throw new Error('Request failed')
    status.value = 'sent'
    message.value = ''
  } catch {
    status.value = 'error'
  }
}
</script>

<template>
  <!-- FAB trigger -->
  <button
    v-if="status === 'idle'"
    type="button"
    aria-label="Send feedback"
    class="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
    @click="openWidget"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M12 8v4M12 16h.01"/>
    </svg>
  </button>

  <!-- Panel -->
  <Transition name="fade">
    <div
      v-else
      role="dialog"
      aria-label="Feedback"
      aria-modal="false"
      class="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <span class="text-sm font-semibold">Send feedback</span>
        <button
          type="button"
          aria-label="Close feedback panel"
          class="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          @click="status = 'idle'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-4">
        <!-- Success -->
        <div v-if="status === 'sent'" class="flex flex-col items-center gap-2 py-6 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-500" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <p class="text-sm font-medium">Thanks! Got it.</p>
          <button type="button" class="mt-1 text-xs text-[var(--color-text-muted)] underline-offset-2 hover:underline" @click="status = 'idle'">Close</button>
        </div>

        <!-- Form -->
        <form v-else @submit.prevent="handleSubmit" class="flex flex-col gap-3">
          <label for="feedback-msg" class="sr-only">Your feedback</label>
          <textarea
            id="feedback-msg"
            ref="textareaEl"
            v-model="message"
            rows="4"
            placeholder="What's on your mind?"
            :disabled="status === 'sending'"
            class="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm placeholder:text-[var(--color-text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
          />
          <p v-if="status === 'error'" role="alert" class="text-xs text-red-500">Something went wrong. Try again.</p>
          <button
            type="submit"
            :disabled="status === 'sending' || !message.trim()"
            class="self-end flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/>
            </svg>
            {{ status === 'sending' ? 'Sending…' : 'Send' }}
          </button>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active { transition: opacity 150ms ease, transform 200ms cubic-bezier(0.16,1,0.3,1); }
.fade-leave-active { transition: opacity 120ms ease; }
.fade-enter-from { opacity: 0; transform: translateY(8px); }
.fade-leave-to { opacity: 0; }
</style>
