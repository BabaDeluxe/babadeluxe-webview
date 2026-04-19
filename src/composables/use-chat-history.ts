import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '@/stores/use-conversation-store'
import { LOGGER_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'

export function useChatHistory(currentConversationId: { value: number }) {
  const logger = safeInject(LOGGER_KEY)
  const store = useConversationStore()
  const { messages } = storeToRefs(store)
  const { loadMessages } = store

  const isLoadingMessages = ref(false)

  async function loadMessagesForCurrentConversation(): Promise<void> {
    if (!currentConversationId.value) {
      messages.value = []
      return
    }

    isLoadingMessages.value = true
    const result = await loadMessages(currentConversationId.value)
    isLoadingMessages.value = false

    if (result.isErr()) {
      logger.error('Failed to load messages in chat view', {
        conversationId: currentConversationId.value,
        error: result.error,
      })
      return
    }
  }

  return {
    messages,
    isLoadingMessages,
    loadMessagesForCurrentConversation,
  }
}
