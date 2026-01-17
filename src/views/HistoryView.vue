<template>
  <section
    id="history"
    class="relative flex flex-col w-full h-full overflow-hidden bg-slate"
    :class="{ 'select-none': splitIsDragging || verticalIsDragging }"
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
      :results="searchResults"
      :is-loading="isSearching"
      :highlighted-index="highlightedIndex"
      :get-result-subtitle="getSearchResultSubtitle"
      :get-result-main-text="getSearchResultMainText"
      @result-click="handleSearchResultClick"
      @result-hover="handleResultHover"
    />

    <div
      v-if="isLoading"
      class="flex-1 flex justify-center items-center"
    >
      <div class="flex items-center gap-2 text-subtleText">
        <BaseSpinner size="medium" />
        <span>Loading conversations...</span>
      </div>
    </div>

    <div
      v-else
      class="flex-1 overflow-hidden px-4 pt-4"
    >
      <template v-if="showSelectedMessages">
        <!-- Mobile: Vertical stack -->
        <div
          ref="verticalContainer"
          class="flex flex-col md:hidden h-full"
        >
          <!-- Conversations (Top Half) -->
          <div
            class="flex flex-col gap-2 overflow-y-auto"
            :style="{ height: verticalTopHeightPercent }"
          >
            <ConversationList
              :conversations="filteredConversations"
              :current-conversation-id="currentConversationId ?? -1"
              :empty-description="searchQuery ? 'No conversations found' : 'No conversations yet'"
              :get-message-count="getMessageCount"
              @select="onSwitchConversation"
              @rename="handleRenameConversation"
              @delete="onDeleteConversation"
            />
          </div>

          <!-- Resizer Handle -->
          <div
            class="relative flex items-center justify-center cursor-row-resize group flex-shrink-0"
            :class="{ 'bg-accent/10': verticalIsDragging }"
            @mousedown="verticalStartDragging"
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
            class="flex flex-col gap-2 overflow-y-auto border-t border-borderMuted pt-4"
            :style="{ height: verticalBottomHeightPercent }"
          >
            <MessageList
              :messages="selectedConversationMessages"
              :conversation-title="currentConversationTitle"
              :is-loading="messagesLoading"
              :show-rewrite="true"
              @delete="handleDeleteMessage"
              @update="handleUpdateMessage"
            />
          </div>
        </div>

        <!-- Desktop: Split view -->
        <div
          ref="splitContainer"
          class="hidden md:flex flex-row h-full relative"
        >
          <!-- Left Pane: Conversations -->
          <div
            class="flex flex-col gap-2 overflow-y-auto pr-2"
            :style="{ width: splitLeftWidthPercent }"
          >
            <ConversationList
              :conversations="filteredConversations"
              :current-conversation-id="currentConversationId ?? -1"
              :empty-description="searchQuery ? 'No conversations found' : 'No conversations yet'"
              :get-message-count="getMessageCount"
              @select="onSwitchConversation"
              @rename="handleRenameConversation"
              @delete="onDeleteConversation"
            />
          </div>

          <!-- Resizer Handle -->
          <div
            class="relative flex items-center justify-center cursor-col-resize group"
            :class="{ 'bg-accent/10': splitIsDragging }"
            @mousedown="splitStartDragging"
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
            class="flex flex-col gap-2 overflow-y-auto pl-2 border-l border-borderMuted"
            :style="{ width: splitRightWidthPercent }"
          >
            <MessageList
              :messages="selectedConversationMessages"
              :conversation-title="currentConversationTitle"
              :is-loading="messagesLoading"
              :show-rewrite="true"
              @delete="handleDeleteMessage"
              @update="handleUpdateMessage"
            />
          </div>
        </div>
      </template>

      <!-- Case: No messages selected -->
      <div
        v-else
        class="flex flex-col gap-2 h-full overflow-y-auto"
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
      :dismissible="false"
    />

    <!-- Rename Dialog -->
    <BaseModal
      v-model:show="renameDialog.show"
      title="Rename Conversation"
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
import { ref, onMounted, computed, inject, nextTick } from 'vue'
import { type Conversation } from '@/database/types'
import { type ConsoleLogger } from '@simwai/utils'
import { onClickOutside } from '@vueuse/core'
import ConversationList from '@/components/ConversationList.vue'
import MessageList from '@/components/MessageList.vue'
import BaseModal from '@/components/BaseModal.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import BaseAlert from '@/components/BaseAlert.vue'
import SearchResultsDropdown from '@/components/SearchResultsDropdown.vue'
import { useConversation } from '@/composables/use-conversation'
import { type SearchService } from '@/search-service'
import { type SearchResult, isMessageResult, isConversationResult } from '@/search-types'
import BaseTextField from '@/components/BaseTextField.vue'
import { KEY_VALUE_STORE_KEY, LOGGER_KEY, SEARCH_SERVICE_KEY } from '@/injection-keys'
import { useSearch } from '@/composables/use-search'
import { type KeyValueStore } from '@/database/key-value-store'
import { useResizableSplit } from '@/composables/use-resizable-split'

const logger: ConsoleLogger = inject(LOGGER_KEY)!
const searchService: SearchService = inject(SEARCH_SERVICE_KEY)!
const keyValueStore: KeyValueStore = inject(KEY_VALUE_STORE_KEY)!

const {
  initialize,
  messages,
  conversations,
  currentConversationId,
  getMessageCount,
  isLoading,
  error,
  deleteConversation,
  switchConversation,
  deleteMessage,
  updateUserMessage,
  updateConversationTitle,
} = useConversation()

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

const renameDialog = ref({
  show: false,
  conversation: null as Conversation | null,
  title: '',
})

onMounted(async () => {
  await initialize()
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

  return conversations.value.filter((conv: { title: string }) =>
    conv.title.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

const selectedConversationMessages = computed(() => {
  return messages.value
})

const currentConversationTitle = computed(() => {
  const conversation = conversations.value.find((c) => c.id === currentConversationId.value)
  return conversation?.title || 'Unknown Conversation'
})

const showSelectedMessages = computed(() => {
  return (
    currentConversationId.value &&
    currentConversationId.value > 0 &&
    selectedConversationMessages.value.length > 0
  )
})

const truncateText = (text: string, maxLength = 150) => {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

const handleSearch = () => {
  performSearch(searchQuery.value)
}

const switchToConversation = async (conversationId: number) => {
  try {
    messagesLoading.value = true
    await switchConversation(conversationId)
  } catch (error) {
    logger.error('Failed to switch conversation:', error as Error)
  } finally {
    messagesLoading.value = false
  }
}

const handleDeleteConversation = async (conversationId: number) => {
  if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) {
    return
  }

  try {
    const success = await deleteConversation(conversationId)
    if (!success) {
      logger.error('Failed to delete conversation')
    }
  } catch (error) {
    logger.error('Error deleting conversation:', error as Error)
  }
}

const handleRenameConversation = (conversation: Conversation) => {
  renameDialog.value = {
    show: true,
    conversation,
    title: conversation.title,
  }
}

const confirmRename = async () => {
  if (!renameDialog.value.conversation || !renameDialog.value.title.trim()) {
    return
  }

  try {
    const success = await updateConversationTitle(
      renameDialog.value.conversation.id,
      renameDialog.value.title.trim()
    )
    if (!success) {
      logger.error('Failed to rename conversation')
    }
  } catch (error) {
    logger.error('Error renaming conversation:', error as Error)
  } finally {
    cancelRename()
  }
}

const cancelRename = () => {
  renameDialog.value = {
    show: false,
    conversation: null,
    title: '',
  }
}

const handleDeleteMessage = async (messageId: number) => {
  if (!confirm('Are you sure you want to delete this message?')) {
    return
  }

  try {
    const success = await deleteMessage(messageId)
    if (!success) {
      logger.error('Failed to delete message')
    }
  } catch (error) {
    logger.error('Error deleting message:', error as Error)
  }
}

const handleUpdateMessage = async (messageId: number, content: string) => {
  const result = await updateUserMessage(messageId, content)
  if (result.isErr()) logger.error('Failed to update message:', result.error)
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

  const messageElement = document.querySelector(`[data-message-id="${mid}"]`) as HTMLElement
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    messageElement.style.backgroundColor = 'rgba(var(--accent-rgb), 0.2)'
    setTimeout(() => {
      messageElement.style.backgroundColor = ''
    }, 2000)
  }
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
