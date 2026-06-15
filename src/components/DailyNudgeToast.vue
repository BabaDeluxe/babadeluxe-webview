<template>
  <Transition name="nudge-slide">
    <div
      v-if="limitStore.showNudge"
      role="status"
      aria-live="polite"
      class="pointer-events-auto fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-full border border-borderMuted/20 bg-panel px-4 py-2.5 shadow-lg"
    >
      <span class="i-bi:lightning-charge-fill h-3.5 w-3.5 text-amber-400 shrink-0" />
      <p class="text-xs font-medium text-deepText whitespace-nowrap">
        {{ remaining }} free {{ remaining === 1 ? 'message' : 'messages' }} left today
      </p>
      <a
        v-if="upgradeUrl"
        :href="upgradeUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs font-semibold text-primary transition-opacity hover:opacity-75"
        @click="limitStore.onUpgradeClick()"
      >
        Go Pro →
      </a>
      <button
        class="ml-1 rounded-full p-0.5 text-textMuted transition-colors hover:text-deepText"
        aria-label="Dismiss"
        @click="limitStore.dismissNudge()"
      >
        <span class="i-bi:x h-3.5 w-3.5" />
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useMessageLimitStore } from '@/stores/use-message-limit-store'

const limitStore = useMessageLimitStore()
const upgradeUrl = import.meta.env.VITE_UPGRADE_URL ?? null

const remaining = limitStore.remaining
</script>

<style scoped>
.nudge-slide-enter-active,
.nudge-slide-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.nudge-slide-enter-from,
.nudge-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
