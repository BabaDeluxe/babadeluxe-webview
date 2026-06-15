<template>
  <div>
    <!-- Floating trigger -->
    <button
      class="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl active:scale-95"
      aria-label="Send feedback"
      @click="open = !open"
    >
      <span class="i-bi:chat-square-text h-4 w-4" />
      <span class="hidden sm:inline">Feedback</span>
    </button>

    <!-- Panel -->
    <Transition name="feedback-panel">
      <div
        v-if="open"
        role="dialog"
        aria-modal="true"
        aria-label="Feedback form"
        class="fixed bottom-20 right-6 z-50 w-80 rounded-2xl border border-borderMuted/20 bg-panel shadow-2xl"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-borderMuted/20 px-4 py-3">
          <span class="text-sm font-semibold text-deepText">Share your thoughts</span>
          <button
            class="rounded-md p-1 text-textMuted transition-colors hover:bg-slate hover:text-deepText"
            aria-label="Close feedback"
            @click="open = false"
          >
            <span class="i-bi:x h-4 w-4" />
          </button>
        </div>

        <!-- Success state -->
        <div
          v-if="submitted"
          class="flex flex-col items-center gap-2 px-4 py-8 text-center"
        >
          <span class="text-2xl">🎉</span>
          <p class="text-sm font-medium text-deepText">Thanks for your feedback!</p>
          <p class="text-xs text-textMuted">We read every message.</p>
        </div>

        <!-- Form -->
        <form
          v-else
          class="flex flex-col gap-3 p-4"
          @submit.prevent="handleSubmit"
        >
          <!-- Star rating -->
          <div class="flex items-center gap-1">
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              :aria-label="`Rate ${star} stars`"
              class="transition-transform hover:scale-110 active:scale-95"
              @mouseenter="hoverRating = star"
              @mouseleave="hoverRating = undefined"
              @click="rating = star"
            >
              <span
                class="h-5 w-5"
                :class="(hoverRating ?? rating ?? 0) >= star ? 'i-bi:star-fill text-amber-400' : 'i-bi:star text-textMuted'"
              />
            </button>
            <span class="ml-1 text-xs text-textMuted">{{ rating ? `${rating}/5` : 'optional' }}</span>
          </div>

          <!-- Message -->
          <textarea
            v-model="message"
            rows="4"
            required
            placeholder="What's on your mind?"
            class="w-full resize-none rounded-lg border border-borderMuted/20 bg-slate/40 px-3 py-2 text-sm text-deepText placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          <!-- Email -->
          <input
            v-model="email"
            type="email"
            placeholder="Email (optional, for follow-up)"
            class="w-full rounded-lg border border-borderMuted/20 bg-slate/40 px-3 py-2 text-sm text-deepText placeholder:text-textMuted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          <button
            type="submit"
            :disabled="!message.trim() || submitting || !feedbackUrl"
            class="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span class="i-bi:send h-3.5 w-3.5" />
            {{ submitting ? 'Sending…' : 'Send feedback' }}
          </button>

          <p v-if="!feedbackUrl" class="text-xs text-error text-center">
            Feedback unavailable: VITE_FEEDBACK_API_URL is not set.
          </p>
        </form>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// No fallback — must be set explicitly in .env
const feedbackUrl = import.meta.env.VITE_FEEDBACK_API_URL
  ? `${import.meta.env.VITE_FEEDBACK_API_URL}/api/feedback`
  : null

const open = ref(false)
const message = ref('')
const email = ref('')
const rating = ref<number | undefined>()
const hoverRating = ref<number | undefined>()
const submitting = ref(false)
const submitted = ref(false)

async function handleSubmit() {
  if (!message.value.trim() || submitting.value || !feedbackUrl) return
  submitting.value = true
  try {
    await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.value.trim(),
        source: 'webview',
        rating: rating.value,
        email: email.value.trim() || undefined,
      }),
    })
    submitted.value = true
    message.value = ''
    email.value = ''
    rating.value = undefined
    setTimeout(() => {
      submitted.value = false
      open.value = false
    }, 2500)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.feedback-panel-enter-active,
.feedback-panel-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.feedback-panel-enter-from,
.feedback-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
