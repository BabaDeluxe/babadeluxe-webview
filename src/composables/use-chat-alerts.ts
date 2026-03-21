import { toUserMessage } from '@/error-mapper'
import { useToastStore } from '@/stores/use-toast-store'
import { type Ref, ref, watch } from 'vue'

export function useChatAlerts(
  conversationError: Ref<string | undefined>,
  contextError: Ref<string | undefined>,
  promptsError: Ref<string | undefined>,
  clearPromptsError: () => void
) {
  const toasts = useToastStore()

  const modelsReloadWarning = ref<string>()
  const persistenceWarning = ref<string>()

  const attachWatcher = (
    sourceRef: Ref<string | undefined>,
    type: 'error' | 'warning',
    clearFn?: () => void
  ) => {
    watch(
      sourceRef,
      (newValue, oldValue) => {
        if (!newValue || newValue === oldValue) return
        toasts[type](toUserMessage(newValue))
        if (clearFn) clearFn()
      },
      { immediate: true }
    )
  }

  attachWatcher(conversationError, 'error', () => (conversationError.value = undefined))
  attachWatcher(contextError, 'error', () => (conversationError.value = undefined))
  attachWatcher(promptsError, 'error', () => {
    clearPromptsError()
  })
  attachWatcher(modelsReloadWarning, 'warning', () => (conversationError.value = undefined))
  attachWatcher(persistenceWarning, 'warning', () => (conversationError.value = undefined))

  return {
    modelsReloadWarning,
    persistenceWarning,
  }
}
