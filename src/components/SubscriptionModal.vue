<template>
  <Teleport to="body">
    <div
      v-if="isVisible"
      class="absolute top-0 left-0 pt-4 overflow-y-auto w-full h-full bg-slate/80 flex items-center justify-center z-50 animate-fade-in animate-duration-200 animate-ease-out"
      aria-modal="true"
      role="dialog"
      aria-labelledby="upsell-title"
    >
      <div
        class="bg-panel border border-borderMuted rounded-lg shadow-2xl p-8 max-w-4xl w-full flex flex-col gap-6"
      >
        <!-- X Button -->
        <BaseButton
          variant="icon"
          class="absolute top-4 right-4 text-subtleText hover:text-deepText transition-colors"
          aria-label="Close modal"
          @click="handleClose"
        >
          <i class="i-bi:x-lg text-xl" />
        </BaseButton>

        <!-- Header -->
        <header class="text-center">
          <h2
            id="upsell-title"
            class="text-3xl font-bold text-deepText mb-2"
          >
            You've Reached Your Daily Limit
          </h2>
          <p class="text-subtleText">
            Upgrade to Pro to unlock unlimited messages and powerful, exclusive features.
          </p>
        </header>

        <!-- Error Message -->
        <div
          v-if="error"
          class="bg-error/10 border border-error rounded-lg p-4 text-error text-sm"
        >
          {{ error }}
        </div>

        <!-- Pricing Tiers -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Hobby Plan -->
          <div class="border border-borderMuted/50 rounded-lg p-6 flex flex-col">
            <h3 class="text-xl font-semibold text-deepText">Hobby</h3>
            <p class="text-subtleText text-sm flex-grow mb-4">
              For trying out the mentor workflow for private projects.
            </p>
            <div class="mb-6">
              <span class="text-4xl font-bold text-deepText">€0</span>
            </div>
            <BaseButton
              variant="secondary"
              class="mt-auto w-full"
              :is-disabled="true"
            >
              Your Current Plan
            </BaseButton>
          </div>

          <!-- Pro Plan -->
          <div class="border-2 border-accent rounded-lg p-6 flex flex-col relative">
            <div
              class="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-slate px-3 py-1 text-xs font-bold rounded-full"
            >
              RECOMMENDED
            </div>
            <h3 class="text-xl font-semibold text-deepText">Pro</h3>
            <p class="text-subtleText text-sm flex-grow mb-4">
              For professionals who need unlimited power and priority access to new features.
            </p>
            <div class="mb-6">
              <span class="text-4xl font-bold text-deepText">€10</span>
              <span class="text-subtleText">/ month</span>
            </div>
            <ul class="space-y-2 text-subtleText text-sm mb-6">
              <li class="flex items-center gap-2">
                <i class="i-bi:check-circle text-accent" />
                <span><strong>Unlimited</strong> messages</span>
              </li>
              <li class="flex items-center gap-2">
                <i class="i-bi:check-circle text-accent" />
                <span>Includes BabaSeniorDev™ prompt</span>
              </li>
              <li class="flex items-center gap-2">
                <i class="i-bi:check-circle text-accent" />
                <span>Access to all <strong>upcoming prompts</strong></span>
              </li>
              <li class="flex items-center gap-2">
                <i class="i-bi:check-circle text-accent" />
                <span>Prioritized email support</span>
              </li>
            </ul>
            <BaseButton
              variant="primary"
              class="mt-auto w-full"
              :is-disabled="isUpgrading"
              @click="handleUpgrade"
            >
              {{ isUpgrading ? 'Redirecting...' : 'Upgrade to Pro' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import BaseButton from '@/components/BaseButton.vue'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'

defineProps<{
  isVisible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { redirectToCheckout, isUpgrading, error } = useSubscriptionSocket()

const handleUpgrade = () => {
  void redirectToCheckout()
}

const handleClose = () => {
  emit('close')
}
</script>
