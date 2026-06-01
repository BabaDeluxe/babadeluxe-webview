<script setup lang="ts">
import {useMessageLimit} from '@/composables/useMessageLimit'

const {isLocked, upsellCopy, remaining, onUpgrade} = useMessageLimit()
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isLocked"
      role="dialog"
      aria-modal="true"
      aria-label="Daily message limit reached"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div class="mx-4 w-full max-w-sm rounded-2xl bg-[var(--color-surface)] p-8 text-center shadow-2xl">
        <!-- Icon -->
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <p class="mb-2 text-lg font-semibold text-[var(--color-text)]">{{ upsellCopy }}</p>
        <p class="mb-6 text-sm text-[var(--color-text-muted)]">You've used all {{ 10 }} free messages today. Resets at midnight.</p>

        <button
          type="button"
          class="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]"
          @click="onUpgrade"
        >
          Upgrade to Pro →
        </button>

        <p class="mt-3 text-xs text-[var(--color-text-faint)]">
          {{ remaining }} messages left today
        </p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 200ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
