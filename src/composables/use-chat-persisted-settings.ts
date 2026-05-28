import { ref } from 'vue'
import type { KeyValueStore } from '@/database/key-value-store'
import type { AbstractLogger } from '@/logger'

export function useChatPersistedSettings(
  keyValueStore: KeyValueStore,
  logger: AbstractLogger,
  currentConversationId: { value: number },
  currentUserId: { value: string | undefined },
  persistenceWarning: { value: string | undefined }
) {
  const currentPrompt = ref('BabaSeniorDev™')
  const currentModel = ref('')

  const loadPersistedSettings = async (): Promise<void> => {
    const promptResult = await keyValueStore.get('chat-prompt')
    if (promptResult.isOk() && promptResult.value !== undefined) {
      currentPrompt.value = promptResult.value
    }

    const modelResult = await keyValueStore.get('chat-model')
    if (modelResult.isOk() && modelResult.value !== undefined) {
      currentModel.value = modelResult.value
    }
  }

  const persistPrompt = async (newValue: string) => {
    const result = await keyValueStore.set('chat-prompt', newValue)
    if (result.isErr()) {
      logger.error('Failed to persist prompt selection', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        promptValue: newValue,
        error: result.error,
      })
      persistenceWarning.value = 'Failed to save your prompt selection. It may reset after refresh.'
    }
  }

  const persistModel = async (newValue: string) => {
    const result = await keyValueStore.set('chat-model', newValue)
    if (result.isErr()) {
      logger.error('Failed to persist model selection', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        modelValue: newValue,
        error: result.error,
      })
      persistenceWarning.value = 'Failed to save your model selection. It may reset after refresh.'
    }
  }

  return {
    currentPrompt,
    currentModel,
    loadPersistedSettings,
    persistPrompt,
    persistModel,
  }
}
