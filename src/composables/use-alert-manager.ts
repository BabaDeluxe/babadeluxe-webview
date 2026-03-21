import { ref, computed } from 'vue'
import { toUserMessage } from '@/error-mapper'

export type AlertType = 'error' | 'warning' | 'info'

export interface Alert {
  id: string
  message: string
  type: AlertType
  isDismissible: boolean
  onClose?: () => void
}

export function useAlertManager() {
  const alerts = ref<Alert[]>([])

  const removeAlert = (id: string) => {
    const index = alerts.value.findIndex((a) => a.id === id)
    if (index !== -1) alerts.value.splice(index, 1)
  }

  const addAlert = (alert: Omit<Alert, 'id'> & { id?: string }) => {
    const id = alert.id ?? Date.now().toString()
    // Remove existing with same ID to update (e.g. updating error message)
    const existingIndex = alerts.value.findIndex((a) => a.id === id)
    if (existingIndex !== -1) {
      alerts.value.splice(existingIndex, 1, { ...alert, id })
    } else {
      alerts.value.push({ ...alert, id })
    }
  }

  const setError = (id: string, error: unknown) => {
    if (!error) {
      removeAlert(id)
      return
    }
    addAlert({
      id,
      message: toUserMessage(error),
      type: 'error',
      isDismissible: true,
      onClose: () => {
        removeAlert(id)
      },
    })
  }

  const setWarning = (id: string, message: string | undefined) => {
    if (!message) {
      removeAlert(id)
      return
    }
    addAlert({
      id,
      message,
      type: 'warning',
      isDismissible: true,
      onClose: () => {
        removeAlert(id)
      },
    })
  }

  return {
    alerts: computed(() => alerts.value),
    addAlert,
    removeAlert,
    setError,
    setWarning,
  }
}
