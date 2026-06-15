<template>
  <Transition name="gate-fade">
    <div
      v-if="limitStore.showGate"
      role="dialog"
      aria-modal="true"
      aria-label="Daily message limit reached"
      class="pointer-events-auto absolute inset-0 z-40 flex items-end justify-center pb-24 backdrop-blur-sm"
    >
      <div class="mx-4 w-full max-w-md rounded-2xl border border-borderMuted/20 bg-panel p-6 shadow-2xl">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <span class="i-bi:lock-fill h-5 w-5" />
          </div>
          <p class="flex-1 text-sm font-medium leading-snug text-deepText">
            {{ limitStore.upsellCopy }}
          </p>
        </div>

        <div class="flex items-center gap-2 text-xs text-textMuted mb-5">
          <span class="i-bi:arrow-clockwise h-3.5 w-3.5" />
          Resets at midnight · 10 free messages per day
        </div>

        <a
          :href="upgradeUrl || '#'"
          target="_blank"
          rel="noopener noreferrer"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
          @click="limitStore.onUpgradeClick()"
        >
          <span class="i-bi:lightning-charge-fill h-4 w-4" />
          Upgrade to Pro — Unlimited Messages
        </a>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useMessageLimitStore } from '@/stores/use-message-limit-store'

const limitStore = useMessageLimitStore()
const upgradeUrl = import.meta.env.VITE_UPGRADE_URL ?? null
</script>

<style scoped>
.gate-fade-enter-active,
.gate-fade-leave-active {
  transition: opacity 200ms ease;
}
.gate-fade-enter-from,
.gate-fade-leave-to {
  opacity: 0;
}
</style>
