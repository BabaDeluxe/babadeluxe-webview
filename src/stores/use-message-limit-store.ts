import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const DAILY_LIMIT = 10
const STORAGE_KEY_DATE = 'baba_msg_date'
const STORAGE_KEY_COUNT = 'baba_msg_count'
const STORAGE_KEY_NUDGE = 'baba_nudge_shown'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function readPersistedCount(): number {
  try {
    const date = localStorage.getItem(STORAGE_KEY_DATE)
    if (date !== todayISO()) return 0
    return parseInt(localStorage.getItem(STORAGE_KEY_COUNT) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

function readNudgeShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_NUDGE) === todayISO()
  } catch {
    return false
  }
}

/**
 * Statsig helpers are injected lazily via setAnalytics() so the store
 * doesn't need to call inject() itself (stores run outside component context).
 */
type StatsigHelpers = {
  getUpsellCopy: () => string
  logLimitEvent: (name: string, variant: string, extra?: Record<string, string>) => void
}

export const useMessageLimitStore = defineStore('messageLimit', () => {
  const count = ref(readPersistedCount())
  const nudgeShown = ref(readNudgeShown())
  const showGate = ref(false)
  const showNudge = ref(false)
  const upsellCopy = ref(FALLBACK_COPY)

  let _statsig: StatsigHelpers | null = null

  function setAnalytics(helpers: StatsigHelpers) {
    _statsig = helpers
  }

  const remaining = computed(() => Math.max(0, DAILY_LIMIT - count.value))
  const isLocked = computed(() => count.value >= DAILY_LIMIT)

  function _persist() {
    try {
      localStorage.setItem(STORAGE_KEY_DATE, todayISO())
      localStorage.setItem(STORAGE_KEY_COUNT, String(count.value))
    } catch { /* sandboxed */ }
  }

  function _resetIfNewDay() {
    try {
      if (localStorage.getItem(STORAGE_KEY_DATE) !== todayISO()) {
        count.value = 0
        nudgeShown.value = false
        showGate.value = false
        showNudge.value = false
      }
    } catch { /* sandboxed */ }
  }

  /** Call before sending a message. Returns false if locked (caller must abort). */
  function recordMessage(): boolean {
    _resetIfNewDay()

    if (isLocked.value) {
      upsellCopy.value = _statsig?.getUpsellCopy() ?? FALLBACK_COPY
      showGate.value = true
      _statsig?.logLimitEvent('message_limit_gate_shown', upsellCopy.value)
      return false
    }

    count.value++
    _persist()

    if (count.value === 1 && !nudgeShown.value) {
      upsellCopy.value = _statsig?.getUpsellCopy() ?? FALLBACK_COPY
      showNudge.value = true
      nudgeShown.value = true
      try { localStorage.setItem(STORAGE_KEY_NUDGE, todayISO()) } catch { /* sandboxed */ }
      _statsig?.logLimitEvent('nudge_shown', upsellCopy.value)
    }

    if (count.value >= DAILY_LIMIT) {
      upsellCopy.value = _statsig?.getUpsellCopy() ?? FALLBACK_COPY
      showGate.value = true
      _statsig?.logLimitEvent('daily_limit_hit', upsellCopy.value)
    }

    return true
  }

  function dismissNudge() {
    showNudge.value = false
  }

  function onUpgradeClick() {
    _statsig?.logLimitEvent('upgrade_clicked', upsellCopy.value, {
      source: showGate.value ? 'gate' : 'nudge',
    })
  }

  function onUpgradeSuccess() {
    _statsig?.logLimitEvent('pro_subscription_started', upsellCopy.value)
  }

  return {
    count,
    remaining,
    isLocked,
    showGate,
    showNudge,
    upsellCopy,
    setAnalytics,
    recordMessage,
    dismissNudge,
    onUpgradeClick,
    onUpgradeSuccess,
  }
})

const FALLBACK_COPY = "You've used all 10 free messages today. Unlock unlimited \u2192"
