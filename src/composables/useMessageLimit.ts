import { ref, computed } from 'vue'
import { getUpsellCopy, logStatsigEvent } from '@/lib/statsig'

const LIMIT = 10
const STORAGE_COUNT = 'baba_msg_count'
const STORAGE_DATE = 'baba_msg_date'
const NUDGE_SHOWN = 'baba_nudge_shown'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  if (localStorage.getItem(STORAGE_DATE) !== todayISO()) {
    localStorage.setItem(STORAGE_DATE, todayISO())
    localStorage.setItem(STORAGE_COUNT, '0')
    localStorage.removeItem(NUDGE_SHOWN)
  }
}

export function useMessageLimit() {
  resetIfNewDay()

  const count = ref(Number(localStorage.getItem(STORAGE_COUNT) ?? 0))
  const isLocked = computed(() => count.value >= LIMIT)
  const remaining = computed(() => Math.max(0, LIMIT - count.value))
  const upsellCopy = computed(() => getUpsellCopy())
  const shouldShowNudge = ref(false)

  function increment(): void {
    if (isLocked.value) return
    count.value++
    localStorage.setItem(STORAGE_COUNT, String(count.value))

    // First message of the day → show once-per-day nudge
    if (count.value === 1 && !localStorage.getItem(NUDGE_SHOWN)) {
      shouldShowNudge.value = true
      localStorage.setItem(NUDGE_SHOWN, '1')
      logStatsigEvent('nudge_shown', { variant: upsellCopy.value })
    }

    // Hit the cap
    if (count.value === LIMIT) {
      logStatsigEvent('daily_limit_hit', { variant: upsellCopy.value })
    }
  }

  function onUpgradeClick(): void {
    logStatsigEvent('pro_subscription_started', { variant: upsellCopy.value })
  }

  function dismissNudge(): void {
    shouldShowNudge.value = false
  }

  return {
    count,
    remaining,
    isLocked,
    upsellCopy,
    shouldShowNudge,
    increment,
    onUpgradeClick,
    dismissNudge,
  }
}
