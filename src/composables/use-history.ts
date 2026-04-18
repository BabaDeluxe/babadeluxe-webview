import { computed, nextTick, onMounted, ref } from 'vue'
import { ResultAsync } from 'neverthrow'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '@/stores/use-conversation-store'
import { useResizableSplit } from '@/composables/use-resizable-split'
import {
  appDbKey,
  keyValueStoreKey,
  loggerKey,
  searchServiceKey,
  supabaseClientKey,
} from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { type Conversation, type Message } from '@/database/types'
import type { SearchService } from '@/search-service'
import type { AbstractLogger } from '@/logger'
import { AuthError } from '@/errors'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { useHistorySearch } from '@/composables/use-history-search'
import { isOfflineMode } from '@/env-validator'

export function useHistory() {
  const store = useConversationStore()
  const { conversations, isLoadingConversations, error } = storeToRefs(store)
  const {
    initialize,
    getMessageCount,
    deleteConversation,
    updateConversationTitle,
    deleteMessage,
    updateUserMessage,
  } = store

  const appDb = safeInject(appDbKey)
  const keyValueStore = safeInject(keyValueStoreKey)
  const logger: AbstractLogger = safeInject(loggerKey)
  const searchService: SearchService = safeInject(searchServiceKey)
  const supabase = safeInject(supabaseClientKey)

  const {
    leftWidthPercent: splitLeftWidthPercent,
    rightWidthPercent: splitRightWidthPercent,
    isDragging: splitIsDragging,
    startDragging: splitStartDragging,
  } = useResizableSplit({
    keyValueStore,
    storageKey: 'history-horizontal-split-ratio',
    refKey: 'horizontal-split-container',
    defaultRatio: 30,
    minRatio: 20,
    maxRatio: 80,
    direction: 'horizontal',
  })

  const {
    leftWidthPercent: verticalTopHeightPercent,
    rightWidthPercent: verticalBottomHeightPercent,
    isDragging: verticalIsDragging,
    startDragging: verticalStartDragging,
  } = useResizableSplit({
    keyValueStore,
    storageKey: 'history-vertical-split-ratio',
    refKey: 'vertical-split-container',
    defaultRatio: 40,
    minRatio: 20,
    maxRatio: 80,
    direction: 'vertical',
  })

  const { createTimeout } = useTrackedTimeouts()

  const selectedConversationId = ref<number | null>(null)
  const selectedConversationMessages = ref<Message[]>([])
  const isLoadingMessages = ref(false)
  const currentUserId = ref<string>()

  const renameDialog = ref({
    'is-shown': false,
    conversation: null as Conversation | null,
    title: '',
  })

  const fetchUserId = async (): Promise<void> => {
    if (isOfflineMode()) {
      currentUserId.value = 'offline-user'
      return
    }

    const getUserResult = await ResultAsync.fromPromise(
      supabase.auth.getUser(),
      (unknownError: unknown) =>
        unknownError instanceof Error
          ? new AuthError(unknownError.message, unknownError)
          : new AuthError('Failed to fetch user', unknownError)
    )

    if (getUserResult.isErr()) {
      logger.error('Failed to fetch user details for history view', {
        error: getUserResult.error,
      })
      return
    }

    const userId = getUserResult.value.data.user?.id
    if (userId) {
      currentUserId.value = userId
    }
  }

  const loadMessagesForConversation = async (conversationId: number): Promise<void> => {
    if (!conversationId) {
      selectedConversationMessages.value = []
      return
    }

    isLoadingMessages.value = true
    const result = await appDb.getMessageByConversation(conversationId)
    isLoadingMessages.value = false

    if (result.isErr()) {
      logger.error('Failed to load messages in history view', {
        conversationId,
        userId: currentUserId.value,
        error: result.error,
      })
      selectedConversationMessages.value = []
      error.value = 'Failed to load messages'
      return
    }

    selectedConversationMessages.value = [...result.value]
  }

  const switchToConversation = async (conversationId: number): Promise<void> => {
    if (!conversationId || conversationId === selectedConversationId.value) return

    selectedConversationId.value = conversationId
    await loadMessagesForConversation(conversationId)
  }

  const navigateToMessage = async (messageId: number, conversationId: number): Promise<void> => {
    await switchToConversation(conversationId)
    await nextTick()
    await nextTick()

    const messageElement = document.querySelector(
      `[data-message-id="${messageId}"]`
    ) as HTMLElement | null

    if (!messageElement) return

    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    messageElement.style.backgroundColor = 'rgba(var(--accent-rgb), 0.2)'

    createTimeout(() => {
      messageElement.style.backgroundColor = ''
    }, 2000)
  }

  const {
    searchQuery,
    searchResults,
    isSearching,
    highlightedIndex,
    dropdownRef,
    filteredConversations,
    handleSearch,
    clearSearch,
    highlightNext,
    highlightPrevious,
    selectHighlighted,
    handleResultHover,
    handleSearchResultClick,
    getSearchResultSubtitle,
    getSearchResultMainText,
  } = useHistorySearch(searchService, conversations, navigateToMessage, switchToConversation)

  onMounted(async () => {
    await Promise.all([initialize(), fetchUserId()])
  })

  const currentConversationTitle = computed(() => {
    const conversation = conversations.value.find(
      (item) => item.id === selectedConversationId.value
    )
    return conversation?.title || 'Unknown Conversation'
  })

  const areSelectedMessagesShown = computed(() => {
    return (
      selectedConversationId.value !== null &&
      selectedConversationId.value > 0 &&
      selectedConversationMessages.value.length > 0
    )
  })

  const handleDeleteConversation = async (conversationId: number): Promise<void> => {
    if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) {
      return
    }

    const result = await deleteConversation(conversationId)

    if (result.isErr()) {
      logger.error('Failed to delete conversation', {
        conversationId,
        userId: currentUserId.value,
        error: result.error,
      })
      error.value = 'Failed to delete conversation'
      return
    }

    if (selectedConversationId.value === conversationId) {
      selectedConversationId.value = null
      selectedConversationMessages.value = []
    }
  }

  const handleRenameConversation = (conversation: Conversation): void => {
    renameDialog.value = {
      'is-shown': true,
      conversation,
      title: conversation.title,
    }
  }

  const confirmRename = async (): Promise<void> => {
    if (!renameDialog.value.conversation || !renameDialog.value.title.trim()) {
      return
    }

    const conversationId = renameDialog.value.conversation.id
    const newTitle = renameDialog.value.title.trim()

    const result = await updateConversationTitle(conversationId, newTitle)

    if (result.isErr()) {
      logger.error('Failed to rename conversation', {
        conversationId,
        userId: currentUserId.value,
        newTitle,
        error: result.error,
      })
      error.value = 'Failed to rename conversation'
    }

    cancelRename()
  }

  const cancelRename = (): void => {
    renameDialog.value = {
      'is-shown': false,
      conversation: null,
      title: '',
    }
  }

  const handleDeleteMessage = async (messageId: number): Promise<void> => {
    if (!confirm('Are you sure you want to delete this message?')) {
      return
    }

    const result = await deleteMessage(messageId)

    if (result.isErr()) {
      logger.error('Failed to delete message', {
        conversationId: selectedConversationId.value,
        userId: currentUserId.value,
        messageId,
        error: result.error,
      })
      error.value = 'Failed to delete message'
      return
    }

    selectedConversationMessages.value = selectedConversationMessages.value.filter(
      (message) => message.id !== messageId
    )
  }

  const handleEditMessage = async (messageId: number, content: string): Promise<void> => {
    const result = await updateUserMessage(messageId, content)

    if (result.isErr()) {
      logger.error('Failed to update message', {
        conversationId: selectedConversationId.value,
        userId: currentUserId.value,
        messageId,
        error: result.error,
      })
      error.value = 'Failed to update message'
      return
    }

    const messageIndex = selectedConversationMessages.value.findIndex(
      (message) => message.id === messageId
    )

    if (messageIndex === -1) return

    const updatedMessage: Message = {
      ...selectedConversationMessages.value[messageIndex],
      content,
    }

    selectedConversationMessages.value.splice(messageIndex, 1, updatedMessage)
  }

  const onSwitchConversation = async (conversation: Conversation): Promise<void> => {
    if (conversation.id == null) return
    await switchToConversation(conversation.id)
  }

  const onDeleteConversation = async (conversation: Conversation): Promise<void> => {
    if (conversation.id == null) return
    await handleDeleteConversation(conversation.id)
  }

  return {
    conversations,
    isLoadingConversations,
    error,

    splitLeftWidthPercent,
    splitRightWidthPercent,
    splitIsDragging,
    splitStartDragging,

    verticalTopHeightPercent,
    verticalBottomHeightPercent,
    verticalIsDragging,
    verticalStartDragging,

    selectedConversationId,
    selectedConversationMessages,
    isLoadingMessages,
    currentConversationTitle,
    areSelectedMessagesShown,

    searchQuery,
    searchResults,
    isSearching,
    highlightedIndex,
    dropdownRef,
    filteredConversations,
    getSearchResultSubtitle,
    getSearchResultMainText,
    handleSearch,
    highlightNext,
    highlightPrevious,
    clearSearch,
    selectHighlighted,
    handleResultHover,
    handleSearchResultClick,

    getMessageCount,
    handleRenameConversation,
    confirmRename,
    cancelRename,
    handleDeleteConversation,
    onSwitchConversation,
    onDeleteConversation,
    renameDialog,

    handleDeleteMessage,
    handleEditMessage,
  }
}
