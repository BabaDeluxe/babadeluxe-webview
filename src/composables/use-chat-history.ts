import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '@/stores/use-conversation-store'
import { useToastStore } from '@/stores/use-toast-store'
import { LOGGER_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { toUserMessage } from '@/error-mapper'

export function useChatHistory(currentConversationId: { value: number }) {
  const logger = safeInject(LOGGER_KEY)
  const store = useConversationStore()
  const toasts = useToastStore()
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
      toasts.error(toUserMessage(result.error))
      return
    }

    if (messages.value.length === 0) {
       logger.warn('No messages found for conversation', {
         conversationId: currentConversationId.value
       })
    }
  }

  return {
    messages,
    isLoadingMessages,
    loadMessagesForCurrentConversation,
  }
}
