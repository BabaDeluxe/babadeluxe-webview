<script setup lang="ts">
import { useMessageLimit } from '@/composables/useMessageLimit'

const { isLocked, remaining, upsellCopy, onUpgradeClick } = useMessageLimit()

const UPGRADE_URL = import.meta.env.VITE_UPGRADE_URL as string ?? 'https://babadeluxe.com/#pricing'
</script>

<template>
  <Transition name="gate-fade">
    <div
      v-if="isLocked"
      role="dialog"
      aria-modal="true"
      aria-label="Daily message limit reached"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div class="mx-4 w-full max-w-sm rounded-2xl bg-surface p-8 text-center shadow-2xl">
        <div class="mb-4 text-4xl" aria-hidden="true">⚡</div>
        <h2 class="mb-3 text-xl font-bold text-text">
          {{ upsellCopy }}
        </h2>
        <p class="mb-6 text-sm text-muted">
          Free plan: {{ remaining }} messages left today.
          Resets at midnight.
        </p>
        <a
          :href="UPGRADE_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="block w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
          @click="onUpgradeClick"
        >
          Upgrade to Pro →
        </a>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.gate-fade-enter-active,
.gate-fade-leave-active {
  transition: opacity 220ms ease, backdrop-filter 220ms ease;
}
.gate-fade-enter-from,
.gate-fade-leave-to {
  opacity: 0;
}
</style>
