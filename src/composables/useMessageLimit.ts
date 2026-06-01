import {ref, computed, readonly} from 'vue'
import {getUpsellVariant, logStatsigEvent} from '@/lib/statsig'

const LIMIT = 10
const STORAGE_COUNT = 'baba_msg_count'
const STORAGE_DATE = 'baba_msg_date'
const STORAGE_NUDGE = 'baba_nudge_shown'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  if (localStorage.getItem(STORAGE_DATE) !== todayISO()) {
    localStorage.setItem(STORAGE_DATE, todayISO())
    localStorage.setItem(STORAGE_COUNT, '0')
    localStorage.removeItem(STORAGE_NUDGE)
  }
}

resetIfNewDay()

const count = ref(Number(localStorage.getItem(STORAGE_COUNT) ?? 0))
const showNudge = ref(false)

export function useMessageLimit() {
  const isLocked = computed(() => count.value >= LIMIT)
  const remaining = computed(() => Math.max(0, LIMIT - count.value))
  const upsellCopy = computed(() => getUpsellVariant())

  function onMessageSent(): void {
    resetIfNewDay()
    count.value++
    localStorage.setItem(STORAGE_COUNT, String(count.value))

    // Fire once-per-day nudge on the very first message
    if (count.value === 1 && !localStorage.getItem(STORAGE_NUDGE)) {
      localStorage.setItem(STORAGE_NUDGE, '1')
      showNudge.value = true
      logStatsigEvent('nudge_shown', {variant: upsellCopy.value})
    }

    if (count.value >= LIMIT) {
      logStatsigEvent('daily_limit_hit', {variant: upsellCopy.value})
    }
  }

  function onUpgrade(): void {
    logStatsigEvent('pro_subscription_started', {variant: upsellCopy.value})
    window.open('/upgrade', '_blank')
  }

  function dismissNudge(): void {
    showNudge.value = false
  }

  return {
    count: readonly(count),
    isLocked,
    remaining,
    upsellCopy,
    showNudge: readonly(showNudge),
    onMessageSent,
    onUpgrade,
    dismissNudge,
  }
}
