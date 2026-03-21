import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
  timeoutId?: ReturnType<typeof setTimeout>
}

export const useToastStore = defineStore('toast', () => {
  const { createTimeout, cancelTimeout } = useTrackedTimeouts()

  const toasts = ref<Toast[]>([])

  const removeToast = (id: string) => {
    const index = toasts.value.findIndex((toast) => toast.id === id)
    if (index === -1) return

    const toast = toasts.value[index]
    if (toast.timeoutId) cancelTimeout(toast.timeoutId)

    toasts.value.splice(index, 1)
  }

  const addToast = (message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (duration > 0) {
      timeoutId = createTimeout(() => {
        removeToast(id)
      }, duration)
    }

    toasts.value.push({ id, message, type, duration, timeoutId })
  }

  const success = (message: string) => {
    addToast(message, 'success')
  }
  const error = (message: string) => {
    addToast(message, 'error', 6000)
  }
  const info = (message: string) => {
    addToast(message, 'info')
  }
  const warning = (message: string) => {
    addToast(message, 'warning')
  }

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
    warning,
  }
})
