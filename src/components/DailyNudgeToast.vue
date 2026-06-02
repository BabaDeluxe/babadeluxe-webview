<script setup lang="ts">
import { useMessageLimit } from '@/composables/useMessageLimit'
import { logStatsigEvent } from '@/lib/statsig'

const { shouldShowNudge, dismissNudge, onUpgradeClick } = useMessageLimit()

const UPGRADE_URL = import.meta.env.VITE_UPGRADE_URL as string ?? 'https://babadeluxe.com/#pricing'

function handleUpgradeClick() {
  logStatsigEvent('nudge_clicked')
  onUpgradeClick()
}
</script>

<template>
  <Transition name="toast-slide">
    <div
      v-if="shouldShowNudge"
      role="status"
      aria-live="polite"
      class="fixed bottom-20 right-4 z-40 flex max-w-xs items-center gap-3 rounded-xl bg-primary px-4 py-3 shadow-lg"
    >
      <span class="text-sm text-primary-foreground">
        ✨ Unlimited messages with Pro
      </span>
      <a
        :href="UPGRADE_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="shrink-0 text-xs font-bold text-primary-foreground underline underline-offset-2"
        @click="handleUpgradeClick"
      >
        See plans
      </a>
      <button
        type="button"
        aria-label="Dismiss"
        class="ml-auto shrink-0 text-primary-foreground/70 transition-colors hover:text-primary-foreground"
        @click="dismissNudge"
      >
        ✕
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
