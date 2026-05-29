import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAnonTrialStore = defineStore(
  'anon-trial',
  () => {
    const token = ref<string | null>(null)
    const used = ref(0)
    const cap = ref(10)
    const exhausted = ref(false)
    const poolDegraded = ref(false)

    const remaining = computed(() => cap.value - used.value)
    const isActive = computed(() => !!token.value && !exhausted.value && !poolDegraded.value)
    const isInputBlocked = computed(() => exhausted.value || poolDegraded.value)

    function setSession(data: { token: string; cap: number; used: number }) {
      token.value = data.token
      cap.value = data.cap
      used.value = data.used
    }

    function incrementUsed() {
      used.value++
    }

    return {
      token,
      used,
      cap,
      exhausted,
      poolDegraded,
      remaining,
      isActive,
      isInputBlocked,
      setSession,
      incrementUsed,
    }
  },
  {
    persist: {
      paths: ['token', 'used', 'exhausted'],
    },
  }
)
