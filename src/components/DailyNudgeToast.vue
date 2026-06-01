<script setup lang="ts">
import {useMessageLimit} from '@/composables/useMessageLimit'

const {showNudge, onUpgrade, dismissNudge} = useMessageLimit()

function handleUpgrade() {
  dismissNudge()
  onUpgrade()
}
</script>

<template>
  <Transition name="slide-up">
    <div
      v-if="showNudge"
      role="status"
      aria-live="polite"
      class="fixed bottom-20 right-4 z-40 flex max-w-xs items-center gap-3 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-white shadow-lg"
    >
      <span class="text-sm leading-snug">✨ Go unlimited — upgrade to Pro</span>
      <button
        type="button"
        class="whitespace-nowrap text-xs font-bold underline underline-offset-2 hover:no-underline"
        @click="handleUpgrade"
      >
        See plans
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        class="ml-1 opacity-70 transition-opacity hover:opacity-100"
        @click="dismissNudge"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active { transition: transform 250ms cubic-bezier(0.16,1,0.3,1), opacity 200ms ease; }
.slide-up-leave-active { transition: transform 200ms ease, opacity 150ms ease; }
.slide-up-enter-from { transform: translateY(16px); opacity: 0; }
.slide-up-leave-to { transform: translateY(8px); opacity: 0; }
</style>
