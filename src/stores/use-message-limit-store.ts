import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUpsellCopy, logEvent } from '@/lib/statsig'

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

export const useMessageLimitStore = defineStore('messageLimit', () => {
  const count = ref(readPersistedCount())
  const nudgeShown = ref(readNudgeShown())
  const showGate = ref(false)
  const showNudge = ref(false)
  const upsellCopy = ref('')

  const remaining = computed(() => Math.max(0, DAILY_LIMIT - count.value))
  const isLocked = computed(() => count.value >= DAILY_LIMIT)

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY_DATE, todayISO())
      localStorage.setItem(STORAGE_KEY_COUNT, String(count.value))
    } catch { /* sandboxed */ }
  }

  function recordMessage() {
    // Reset if new day
    try {
      if (localStorage.getItem(STORAGE_KEY_DATE) !== todayISO()) {
        count.value = 0
        nudgeShown.value = false
        showGate.value = false
        showNudge.value = false
      }
    } catch { /* sandboxed */ }

    if (isLocked.value) {
      // Already locked — surface gate
      upsellCopy.value = getUpsellCopy()
      showGate.value = true
      logEvent('message_limit_gate_shown', { variant: upsellCopy.value })
      return false
    }

    count.value++
    persist()

    // First message of the day: show once-per-day nudge
    if (count.value === 1 && !nudgeShown.value) {
      upsellCopy.value = getUpsellCopy()
      showNudge.value = true
      nudgeShown.value = true
      try {
        localStorage.setItem(STORAGE_KEY_NUDGE, todayISO())
      } catch { /* sandboxed */ }
      logEvent('nudge_shown', { variant: upsellCopy.value })
    }

    if (count.value >= DAILY_LIMIT) {
      upsellCopy.value = getUpsellCopy()
      showGate.value = true
      logEvent('daily_limit_hit', { variant: upsellCopy.value })
    }

    return true
  }

  function dismissNudge() {
    showNudge.value = false
  }

  function onUpgradeClick() {
    logEvent('upgrade_clicked', { variant: upsellCopy.value, source: showGate.value ? 'gate' : 'nudge' })
  }

  function onUpgradeSuccess() {
    logEvent('pro_subscription_started', { variant: upsellCopy.value })
  }

  return {
    count,
    remaining,
    isLocked,
    showGate,
    showNudge,
    upsellCopy,
    recordMessage,
    dismissNudge,
    onUpgradeClick,
    onUpgradeSuccess,
  }
})
