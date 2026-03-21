import { computed, nextTick, onMounted, ref } from 'vue'
import { ResultAsync } from 'neverthrow'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '@/stores/use-conversation-store'
import { useResizableSplit } from '@/composables/use-resizable-split'
import {
  APP_DB_KEY,
  KEY_VALUE_STORE_KEY,
  LOGGER_KEY,
  SEARCH_SERVICE_KEY,
  SUPABASE_CLIENT_KEY,
} from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { type Conversation, type Message } from '@/database/types'
import type { SearchService } from '@/search-service'
import type { KeyValueStore } from '@/database/key-value-store'
import type { AbstractLogger } from '@/logger'
import { AuthError } from '@/errors'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { useHistorySearch } from '@/composables/use-history-search'

export function useHistory() {
  const logger: AbstractLogger = safeInject(LOGGER_KEY)
  const searchService: SearchService = safeInject(SEARCH_SERVICE_KEY)
  const keyValueStore: KeyValueStore = safeInject(KEY_VALUE_STORE_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)
  const appDb = safeInject(APP_DB_KEY)

  const conversationStore = useConversationStore()
  const { conversations, isLoadingConversations, error } = storeToRefs(conversationStore)
  const {
    initialize,
    getMessageCount,
    deleteConversation,
    deleteMessage,
    updateUserMessage,
    updateConversationTitle,
  } = conversationStore

  const {
    leftWidthPercent: splitLeftWidthPercent,
    rightWidthPercent: splitRightWidthPercent,
    isDragging: splitIsDragging,
    startDragging: splitStartDragging,
  } = useResizableSplit({
    keyValueStore,
    storageKey: 'history-split-ratio',
    refKey: 'splitContainer',
    defaultRatio: 35,
    minRatio: 25,
    maxRatio: 65,
  })

  const {
    leftWidthPercent: verticalTopHeightPercent,
    rightWidthPercent: verticalBottomHeightPercent,
    isDragging: verticalIsDragging,
    startDragging: verticalStartDragging,
  } = useResizableSplit({
    keyValueStore,
    storageKey: 'history-vertical-split-ratio',
    refKey: 'verticalContainer',
    defaultRatio: 50,
    minRatio: 0,
    maxRatio: 70,
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
    const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) =>
      unknownError instanceof Error
        ? new AuthError(unknownError.message, unknownError)
        : new AuthError('Failed to fetch user', unknownError)
    )

    getUserResult.match(
      (response) => {
        if (response.data.user?.id) {
          currentUserId.value = response.data.user.id
        }
      },
      (fetchError) => {
        logger.error('Failed to fetch user details for history view', {
          error: fetchError,
        })
      }
    )
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

    isLoadingMessages.value = true
    selectedConversationId.value = conversationId
    await loadMessagesForConversation(conversationId)
    isLoadingMessages.value = false
  }

  const navigateToMessage = async (mid: number, cid: number) => {
    await switchToConversation(cid)
    await nextTick()
    await nextTick()

    const messageElement = document.querySelector(
      `[data-message-id="${mid}"]`
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
    const conversation = conversations.value.find((c) => c.id === selectedConversationId.value)
    return conversation?.title || 'Unknown Conversation'
  })

  const areSelectedMessagesShown = computed(() => {
    return (
      selectedConversationId.value !== null &&
      selectedConversationId.value > 0 &&
      selectedConversationMessages.value.length > 0
    )
  })

  const handleDeleteConversation = async (conversationId: number) => {
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
    } else if (selectedConversationId.value === conversationId) {
      selectedConversationId.value = null
      selectedConversationMessages.value = []
    }
  }

  const handleRenameConversation = (conversation: Conversation) => {
    renameDialog.value = {
      'is-shown': true,
      conversation,
      title: conversation.title,
    }
  }

  const confirmRename = async () => {
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

  const cancelRename = () => {
    renameDialog.value = {
      'is-shown': false,
      conversation: null,
      title: '',
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
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
      (m) => m.id !== messageId
    )
  }

  const handleEditMessage = async (messageId: number, content: string) => {
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

    const idx = selectedConversationMessages.value.findIndex((m) => m.id === messageId)
    if (idx !== -1) {
      const updated: Message = {
        ...selectedConversationMessages.value[idx],
        content,
      }
      selectedConversationMessages.value.splice(idx, 1, updated)
    }
  }

  const onSwitchConversation = async (conversation: Conversation) => {
    if (conversation.id == null) return
    await switchToConversation(conversation.id)
  }

  const onDeleteConversation = async (conversation: Conversation) => {
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
