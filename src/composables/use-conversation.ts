import { storeToRefs } from 'pinia'
import { useConversationStore, type Mutable } from '@/stores/use-conversation-store'

export type { Mutable }

export function useConversation() {
  const store = useConversationStore()
  const {
    messages,
    conversations,
    currentConversationId,
    isLoading,
    error,
    messageCountsByConversation,
  } = storeToRefs(store)

  return {
    // Reactive state
    messages,
    conversations,
    currentConversationId,
    isLoading,
    error,
    messageCountsByConversation,

    // Store actions (legacy-compatible surface)
    initialize: store.initialize,
    refreshMessageById: store.refreshMessageById,
    loadMessages: store.loadMessages,
    loadConversations: store.loadConversations,
    initializeCurrentConversation: store.initializeCurrentConversation,
    switchConversation: store.switchConversation,

    loadMessageCounts: store.loadMessageCounts,
    getMessageCount: store.getMessageCount,

    createConversation: store.createConversation,
    deleteConversation: store.deleteConversation,
    updateConversationTitle: store.updateConversationTitle,

    updateUserMessage: store.updateUserMessage,
    deleteMessage: store.deleteMessage,

    generateConversationTitle: store.generateConversationTitle,
    resumeInterruptedStreams: store.resumeInterruptedStreams,
    debouncedAutoSave: store.debouncedAutoSave,

    sendMessage: store.sendMessage,
    resendFromMessage: store.resendFromMessage,
    rewriteWithModel: store.rewriteWithModel,

    finalizeAssistantMessage: store.finalizeAssistantMessage,
  }
}
