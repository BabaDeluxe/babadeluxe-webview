// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '@/stores/use-conversation-store'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Message } from '@/database/types'

export function useChatHistory(currentConversationId: { value: number }) {
  const logger = safeInject(LOGGER_KEY)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const appDb = safeInject(APP_DB_KEY)
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
