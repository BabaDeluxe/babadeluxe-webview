import { computed, nextTick, onMounted, ref } from 'vue'
import { ResultAsync } from 'neverthrow'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import { useConversationStore } from '@/stores/use-conversation-store'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { useSearch } from '@/composables/use-search'
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
import { type SearchResult, isMessageResult, isConversationResult } from '@/search-types'
import type { AbstractLogger } from '@/logger'
import { AuthError } from '@/errors'

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

  const { searchResults, isSearching, performSearch } = useSearch(searchService)

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

  const selectedConversationId = ref<number | null>(null)
  const selectedConversationMessages = ref<Message[]>([])
  const isLoadingMessages = ref(false)

  const searchQuery = ref('')
  const highlightedIndex = ref(-1)
  const dropdownRef = ref<HTMLElement>()
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

  onMounted(async () => {
    await Promise.all([initialize(), fetchUserId()])
  })

  onClickOutside(dropdownRef, () => {
    if (searchQuery.value) {
      searchQuery.value = ''
      highlightedIndex.value = -1
    }
  })

  const filteredConversations = computed(() => {
    if (!searchQuery.value.trim()) {
      return conversations.value
    }

    return conversations.value.filter((conv) =>
      conv.title.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
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

  const truncateText = (text: string, maxLength = 150) => {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}...`
  }

  const handleSearch = () => {
    performSearch(searchQuery.value)
  }

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

  const clearSearch = () => {
    searchQuery.value = ''
    highlightedIndex.value = -1
  }

  const highlightNext = () => {
    if (searchResults.value.length === 0) return
    highlightedIndex.value = (highlightedIndex.value + 1) % searchResults.value.length
  }

  const highlightPrevious = () => {
    if (searchResults.value.length === 0) return
    highlightedIndex.value =
      highlightedIndex.value <= 0 ? searchResults.value.length - 1 : highlightedIndex.value - 1
  }

  const selectHighlighted = () => {
    if (highlightedIndex.value >= 0 && searchResults.value[highlightedIndex.value]) {
      handleSearchResultClick(searchResults.value[highlightedIndex.value])
    }
  }

  const handleResultHover = (index: number) => {
    highlightedIndex.value = index
  }

  const navigateToMessage = async (messageId: number | string, conversationId: number | string) => {
    const cid = Number(conversationId)
    const mid = Number(messageId)
    if (Number.isNaN(cid) || Number.isNaN(mid)) return

    await switchToConversation(cid)

    await nextTick()
    await nextTick()

    const messageElement = document.querySelector(
      `[data-message-id="${mid}"]`
    ) as HTMLElement | null
    if (!messageElement) return

    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    messageElement.style.backgroundColor = 'rgba(var(--accent-rgb), 0.2)'
    setTimeout(() => {
      messageElement.style.backgroundColor = ''
    }, 2000)
  }

  const getSearchResultSubtitle = (result: SearchResult) => {
    if (isConversationResult(result)) return 'Conversation'
    if (isMessageResult(result)) {
      const found = conversations.value.find((c) => c.id === result.conversationId)
      const title = found?.title || 'Unknown'
      return `Message in "${title}"`
    }

    return 'Result'
  }

  const getSearchResultMainText = (result: SearchResult) => {
    if (isConversationResult(result)) return result.title
    if (isMessageResult(result)) return truncateText(result.content)
    return ''
  }

  const handleSearchResultClick = async (result: SearchResult) => {
    if (isMessageResult(result)) {
      const mid = Number(result.id)
      const cid = Number(result.conversationId)
      await navigateToMessage(mid, cid)
    } else if (isConversationResult(result)) {
      const cid = Number(result.id)
      await switchToConversation(cid)
    }

    searchQuery.value = ''
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

    // layout
    splitLeftWidthPercent,
    splitRightWidthPercent,
    splitIsDragging,
    splitStartDragging,
    verticalTopHeightPercent,
    verticalBottomHeightPercent,
    verticalIsDragging,
    verticalStartDragging,

    // selection + messages
    selectedConversationId,
    selectedConversationMessages,
    isLoadingMessages,
    currentConversationTitle,
    areSelectedMessagesShown,

    // search
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

    // conversation actions
    getMessageCount,
    handleRenameConversation,
    confirmRename,
    cancelRename,
    handleDeleteConversation,
    onSwitchConversation,
    onDeleteConversation,
    renameDialog,

    // message actions
    handleDeleteMessage,
    handleEditMessage,
  }
}
