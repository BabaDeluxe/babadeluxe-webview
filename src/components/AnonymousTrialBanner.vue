<template>
  <div
    v-if="store.isActive && !store.exhausted"
    class="sticky top-0 z-50 w-full bg-panel border-b border-borderMuted px-4 py-2 flex flex-col gap-1 transition-all duration-300"
  >
    <div class="flex justify-between items-center text-xs text-subtleText">
      <span>{{ bannerText }}</span>
      <button
        @click="goToRegister"
        class="text-accent hover:underline font-medium"
      >
        Create free account
      </button>
    </div>

    <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden">
      <div
        class="h-full bg-accent transition-all duration-500 ease-out"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
  <AnonTrialExhausted v-else-if="store.exhausted" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAnonTrialStore } from '@/stores/use-anon-trial-store'
import AnonTrialExhausted from './AnonTrialExhausted.vue'

const store = useAnonTrialStore()
const router = useRouter()

const progress = computed(() => (store.used / store.cap) * 100)

const bannerText = computed(() => {
  if (store.used === 9) return 'Last free message — sign up now'
  if (store.used >= 8) return 'Almost out — sign up to keep going'
  return `${store.used} of ${store.cap} free messages used`
})

const goToRegister = () => {
  router.push({ name: 'register' })
}
</script>
