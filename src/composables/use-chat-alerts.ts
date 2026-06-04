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

  const attachAlertWatcher = (
    errorOrWarningSource: Ref<string | undefined>,
    alertType: 'error' | 'warning',
    clearSourceAction?: () => void
  ) => {
    watch(
      errorOrWarningSource,
      (newAlertMessage, previousAlertMessage) => {
        const hasNewAlertMessage = newAlertMessage && newAlertMessage !== previousAlertMessage
        if (!hasNewAlertMessage) return

        toasts[alertType](toUserMessage(newAlertMessage))
        if (clearSourceAction) clearSourceAction()
      },
      { immediate: true }
    )
  }

  attachAlertWatcher(conversationError, 'error', () => (conversationError.value = undefined))
  attachAlertWatcher(contextError, 'error', () => (conversationError.value = undefined))
  attachAlertWatcher(promptsError, 'error', clearPromptsError)
  attachAlertWatcher(modelsReloadWarning, 'warning', () => (conversationError.value = undefined))
  attachAlertWatcher(persistenceWarning, 'warning', () => (conversationError.value = undefined))

  return {
    modelsReloadWarning,
    persistenceWarning,
  }
}
