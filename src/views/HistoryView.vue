<template>
  <section
    id="history"
    data-testid="history-view-container"
    class="relative flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-slate"
  >
    <div class="flex flex-row w-full items-center justify-center gap-2 px-4 pt-4">
      <i class="i-weui:search-outlined text-3xl text-subtleText" />
      <BaseTextField
        ref="searchInputRef"
        v-model:value="searchQuery"
        placeholder="Search for a message"
        max-height="44px"
        data-testid="history-search-input"
        @update:value="handleSearch"
        @keydown.down.prevent="highlightNext"
        @keydown.up.prevent="highlightPrevious"
        @keydown.enter.exact.prevent="selectHighlighted"
        @keydown.escape="clearSearch"
      />
    </div>

    <SearchResultsDropdown
      v-if="searchQuery"
      ref="dropdownRef"
      data-testid="history-search-dropdown"
      :results="searchResults"
      :is-loading="isSearching"
      :highlighted-index="highlightedIndex"
      :get-result-subtitle="getSearchResultSubtitle"
      :get-result-main-text="getSearchResultMainText"
      @result-click="handleSearchResultClick"
      @result-hover="handleResultHover"
    />

    <div
      v-if="isLoadingConversations"
      data-testid="history-loading-state"
      class="flex-1 flex justify-center items-center"
    >
      <div class="flex items-center gap-2 text-subtleText">
        <BaseSpinner size="medium" />
        <span>Loading conversations...</span>
      </div>
    </div>

    <div
      v-else
      class="flex flex-col flex-1 min-h-0 w-full overflow-hidden px-4 pt-4"
    >
      <template v-if="isLoadingMessages">
        <div class="flex items-center gap-2 text-subtleText">
          <BaseSpinner size="medium" />
          <span>Loading messages...</span>
        </div>
      </template>

      <template v-if="areSelectedMessagesShown && !isLoadingMessages">
        <!-- Mobile: Vertical stack -->
        <div
          ref="verticalContainer"
          class="flex flex-col flex-1 min-h-0 md:hidden"
        >
          <!-- Conversations (Top Half) -->
          <div
            class="flex flex-col gap-2 overflow-y-auto pr-2"
            :style="{ height: verticalTopHeightPercent }"
          >
            <ConversationList
              :conversations="filteredConversations"
              :current-conversation-id="currentConversationId ?? -1"
              :empty-description="searchQuery ? 'No conversations found' : 'No conversations yet'"
              :get-message-count="getMessageCount"
              test-id-prefix="history"
              @select="onSwitchConversation"
              @rename="handleRenameConversation"
              @delete="onDeleteConversation"
            />
          </div>

          <!-- Resizer Handle -->
          <div
            class="relative flex items-center justify-center flex-shrink-0 cursor-row-resize group touch-none select-none"
            :class="{ 'bg-accent/10': verticalIsDragging }"
            @pointerdown="verticalStartDragging"
          >
            <div
              class="h-0.5 w-12 rounded-full transition-all"
              :class="
                verticalIsDragging
                  ? 'bg-accent w-16'
                  : 'bg-borderMuted group-hover:bg-accent group-hover:w-16'
              "
            />
          </div>

          <!-- Messages (Bottom Half) - Mobile -->
          <div
            class="flex flex-col gap-2 overflow-y-auto border-t border-borderMuted pt-4 pr-2"
            :style="{ height: verticalBottomHeightPercent }"
          >
            <MessageList
              :messages="selectedConversationMessages"
              :conversation-title="currentConversationTitle"
              :is-loading="messagesLoading"
              :is-rewrite-enabled="true"
              @delete="handleDeleteMessage"
              @update="handleEditMessage"
            />
          </div>
        </div>

        <!-- Desktop: Split view -->
        <div
          ref="splitContainer"
          class="hidden md:flex flex-row flex-1 min-h-0 relative"
        >
          <!-- Left Pane: Conversations -->
          <div
            class="flex flex-col gap-2 overflow-y-auto pr-4 min-w-0"
            :style="{ width: splitLeftWidthPercent }"
          >
            <ConversationList
              :conversations="filteredConversations"
              :current-conversation-id="currentConversationId ?? -1"
              :empty-description="searchQuery ? 'No conversations found' : 'No conversations yet'"
              :get-message-count="getMessageCount"
              test-id-prefix="history"
              @select="onSwitchConversation"
              @rename="handleRenameConversation"
              @delete="onDeleteConversation"
            />
          </div>

          <!-- Resizer Handle -->
          <div
            class="relative flex items-center justify-center cursor-col-resize group touch-none select-none"
            :class="{ 'bg-accent/10': splitIsDragging }"
            @pointerdown="splitStartDragging"
          >
            <div
              class="w-0.5 h-12 rounded-full transition-all"
              :class="
                splitIsDragging
                  ? 'bg-accent h-16'
                  : 'bg-borderMuted group-hover:bg-accent group-hover:h-16'
              "
            />
          </div>

          <!-- Right Pane: Messages -->
          <div
            class="flex flex-col gap-2 overflow-y-auto pl-4 pr-2 border-l border-borderMuted min-w-0"
            :style="{ width: splitRightWidthPercent }"
          >
            <MessageList
              :messages="selectedConversationMessages"
              :conversation-title="currentConversationTitle"
              :is-loading="messagesLoading"
              :is-rewrite-enabled="true"
              @delete="handleDeleteMessage"
              @update="handleEditMessage"
            />
          </div>
        </div>
      </template>

      <!-- Case: No messages selected -->
      <div
        v-else
        class="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-2"
      >
        <ConversationList
          :conversations="filteredConversations"
          :current-conversation-id="currentConversationId ?? -1"
          :empty-description="
            searchQuery
              ? 'No conversations found'
              : 'No conversations yet. Use the \'New Chat\' button above to start a conversation'
          "
          :get-message-count="getMessageCount"
          test-id-prefix="history"
          @select="onSwitchConversation"
          @rename="handleRenameConversation"
          @delete="onDeleteConversation"
        />
      </div>
    </div>

    <BaseAlert
      v-if="error"
      :message="error"
      type="error"
      :is-dismissible="false"
    />

    <!-- Rename Dialog -->
    <BaseModal
      v-model:is-shown="renameDialog['is-shown']"
      title="Rename Conversation"
      data-test-id="history-rename-modal"
      confirm-text="Rename"
      :confirm-disabled="!renameDialog.title.trim()"
      @confirm="confirmRename"
      @cancel="cancelRename"
    >
      <BaseTextField
        v-model:value="renameDialog.title"
        placeholder="Enter new title"
        max-height="44px"
        @keydown.enter.exact.prevent="confirmRename"
      />
    </BaseModal>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { ResultAsync } from 'neverthrow'
import { storeToRefs } from 'pinia'
import { type Conversation } from '@/database/types'
import { onClickOutside } from '@vueuse/core'
import ConversationList from '@/components/ConversationList.vue'
import MessageList from '@/components/MessageList.vue'
import BaseModal from '@/components/BaseModal.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseAlert from '@/components/BaseAlert.vue'
import SearchResultsDropdown from '@/components/SearchResultsDropdown.vue'
import BaseTextField from '@/components/BaseTextField.vue'
import { useConversationStore } from '@/stores/use-conversation-store'
import { type SearchService } from '@/search-service'
import { type SearchResult, isMessageResult, isConversationResult } from '@/search-types'
import {
  KEY_VALUE_STORE_KEY,
  LOGGER_KEY,
  SEARCH_SERVICE_KEY,
  SUPABASE_CLIENT_KEY,
} from '@/injection-keys'
import { useSearch } from '@/composables/use-search'
import { type KeyValueStore } from '@/database/key-value-store'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { safeInject } from '@/safe-inject'
import { AuthError } from '@/errors'
import type { AbstractLogger } from '@/logger'

defineOptions({ name: 'HistoryView' })

const logger: AbstractLogger = safeInject(LOGGER_KEY)
const searchService: SearchService = safeInject(SEARCH_SERVICE_KEY)
const keyValueStore: KeyValueStore = safeInject(KEY_VALUE_STORE_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)

const conversationStore = useConversationStore()
const {
  messages,
  conversations,
  currentConversationId,
  isLoadingMessages,
  isLoadingConversations,
  error,
} = storeToRefs(conversationStore)
const {
  initialize,
  getMessageCount,
  deleteConversation,
  switchConversation,
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
  minRatio: 30,
  maxRatio: 70,
  direction: 'vertical',
})

const searchQuery = ref('')
const messagesLoading = ref(false)
const highlightedIndex = ref(-1)
const dropdownRef = ref<HTMLElement>()
const currentUserId = ref<string>()

const renameDialog = ref({
  'is-shown': false,
  conversation: null as Conversation | null,
  title: '',
})

const fetchUserId = async (): Promise<void> => {
  const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) => {
    if (unknownError instanceof Error) {
      return new AuthError(unknownError.message, unknownError)
    }
    return new AuthError('Failed to fetch user', unknownError)
  })

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

const selectedConversationMessages = computed(() => messages.value)

const currentConversationTitle = computed(() => {
  const conversation = conversations.value.find((c) => c.id === currentConversationId.value)
  return conversation?.title || 'Unknown Conversation'
})

const areSelectedMessagesShown = computed(() => {
  return (
    currentConversationId.value &&
    currentConversationId.value > 0 &&
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

const switchToConversation = async (conversationId: number) => {
  messagesLoading.value = true
  await switchConversation(conversationId)
  messagesLoading.value = false
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
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      messageId,
      error: result.error,
    })
    error.value = 'Failed to delete message'
  }
}

const handleEditMessage = async (messageId: number, content: string) => {
  const result = await updateUserMessage(messageId, content)

  if (result.isErr()) {
    logger.error('Failed to update message', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      messageId,
      error: result.error,
    })
    error.value = 'Failed to update message'
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

  const messageElement = document.querySelector(`[data-message-id="${mid}"]`) as HTMLElement | null
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
</script>
