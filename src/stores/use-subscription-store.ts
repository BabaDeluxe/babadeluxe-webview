import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SubscriptionTier = 'FREE' | 'PRO'

export const useSubscriptionStore = defineStore('subscription', () => {
  const tier = ref<SubscriptionTier>('FREE')

  function setTier(newTier: SubscriptionTier) {
    tier.value = newTier
  }

  return {
    tier,
    setTier,
  }
})
