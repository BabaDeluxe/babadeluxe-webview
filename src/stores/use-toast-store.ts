import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  const addToast = (message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    toasts.value.push({ id, message, type, duration })

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }

  const removeToast = (id: string) => {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
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
