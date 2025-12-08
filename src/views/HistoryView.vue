<template>
  <section
    id="history"
    class="relative flex flex-col w-full h-full overflow-hidden bg-slate"
  >
    <div class="flex flex-row w-full items-center justify-center gap-2 px-4 pt-4">
      <i class="i-weui:search-outlined text-3xl text-subtleText" />
      <TextItem
        ref="searchInputRef"
        v-model:value="searchQuery"
        placeholder="Search for a message"
        max-height="44px"
        @update:value="handleSearch"
        @keydown.down.prevent="highlightNext"
        @keydown.up.prevent="highlightPrevious"
        @keydown.enter.exact.prevent="selectHighlighted"
        @keydown.escape="clearSearch"
      />
    </div>

    <div
      v-if="searchQuery"
      ref="dropdownRef"
      aria-label="Search results dropdown"
      class="absolute top-14 left-3 right-4 bg-panel border border-borderMuted rounded-md shadow-lg z-50 max-h-64 overflow-y-auto"
    >
      <div
        v-if="isSearching"
        class="flex justify-center p-4"
      >
        <div
          class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"
        />
      </div>

      <div
        v-else
        class="flex flex-col"
      >
        <div
          v-if="searchResults.length === 0"
          class="p-3 text-subtleText text-center"
        >
          No matches found
        </div>
        <div v-else>
          <div
            class="px-3 py-2 text-xs text-subtleText border-b border-borderMuted"
            aria-label="Search result count"
          >
            {{ searchResults.length }} {{ searchResults.length === 1 ? 'result' : 'results' }}
          </div>
          <div
            v-for="(result, index) in searchResults"
            :key="`${result.resultType}-${result.id ?? -1}`"
            :data-result-type="result.resultType"
            :class="[
              'p-3 cursor-pointer border-b border-borderMuted last:border-b-0 transition-colors',
              index === highlightedIndex ? 'bg-accent/20' : 'hover:bg-slate',
            ]"
            @click="onSearchResultClick(result)"
            @mouseenter="highlightedIndex = index"
          >
            <div class="flex items-start gap-2">
              <i
                :class="result.resultType === 'conversation' ? 'i-bi:chat-left' : 'i-bi:chat-text'"
                class="text-accent mt-1 flex-shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="text-xs text-subtleText mb-1">
                  {{ getSearchResultSubtitle(result) }}
                </div>
                <div class="text-sm text-deepText font-medium mb-1 truncate">
                  {{ getSearchResultMainText(result) }}
                </div>
                <div class="text-xs text-accent">Match: {{ (result.score * 100).toFixed(0) }}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isLoading"
      class="flex-1 flex justify-center items-center"
    >
      <div class="flex items-center gap-2 text-subtleText">
        <div
          class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
        />
        <span>Loading conversations...</span>
      </div>
    </div>

    <div
      v-else
      class="flex-1 overflow-hidden px-4 pb-4 pt-4"
    >
      <template v-if="showSelectedMessages">
        <!-- Mobile: Vertical stack -->
        <div
          ref="verticalContainerRef"
          class="flex flex-col md:hidden h-full"
        >
          <!-- Conversations (Top Half) -->
          <div
            class="flex flex-col gap-2 overflow-y-auto"
            :style="{ height: verticalTopHeightPercent }"
          >
            <h3 class="text-lg font-medium text-deepText">Conversations</h3>

            <div
              v-for="conversation in filteredConversations"
              :key="conversation.id ?? -1"
              class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
              :class="{ 'bg-accent/10 border-accent': conversation.id === currentConversationId }"
              @click="onSwitchConversation(conversation)"
            >
              <div class="flex-1">
                <div class="font-medium text-deepText">
                  {{ conversation.title }}
                </div>
                <div class="text-sm text-subtleText">
                  {{ conversation.messageCount || 0 }} messages •
                  {{ formatDate(conversation.updatedAt ?? undefined) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="text-subtleText hover:text-accent p-1 transition-colors"
                  title="Rename conversation"
                  @click.stop="handleRenameConversation(conversation)"
                >
                  <i class="i-weui:pencil-outlined" />
                </button>
                <button
                  class="text-subtleText hover:text-error p-1 transition-colors"
                  title="Delete conversation"
                  @click.stop="onDeleteConversation(conversation)"
                >
                  <i class="i-weui:delete-outlined" />
                </button>
              </div>
            </div>

            <div
              v-if="filteredConversations.length === 0"
              class="flex flex-col items-center justify-center p-8 text-subtleText"
            >
              <i class="i-bi:chat-left text-4xl mb-2 opacity-50" />
              <p class="text-center">
                {{ searchQuery ? 'No conversations found' : 'No conversations yet' }}
              </p>
            </div>
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
            <h4 class="text-md font-medium text-deepText">
              Messages in "{{ currentConversationTitle }}"
            </h4>

            <template v-if="messagesLoading">
              <div class="flex justify-center items-center flex-1">
                <div
                  class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
                />
              </div>
            </template>

            <template v-else>
              <ActiveChatItem
                v-for="message in selectedConversationMessages"
                :key="message.id"
                v-bind="message"
                :data-message-id="message.id"
                :show-rewrite="false"
                @delete="handleDeleteMessage"
                @update="handleUpdateMessage"
              />

              <div
                v-if="selectedConversationMessages.length === 0"
                class="text-center text-subtleText p-4"
              >
                No messages in this conversation
              </div>
            </template>
          </div>
        </div>

        <!-- Desktop: Split view -->
        <div
          ref="splitContainerRef"
          class="hidden md:flex flex-row h-full relative"
        >
          <!-- Left Pane: Conversations -->
          <div
            class="flex flex-col gap-2 overflow-y-auto pr-2"
            :style="{ width: splitLeftWidthPercent }"
          >
            <h3 class="text-lg font-medium text-deepText">Conversations</h3>

            <div
              v-for="conversation in filteredConversations"
              :key="conversation.id ?? -1"
              class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
              :class="{ 'bg-accent/10 border-accent': conversation.id === currentConversationId }"
              @click="onSwitchConversation(conversation)"
            >
              <div class="flex-1">
                <div class="font-medium text-deepText">
                  {{ conversation.title }}
                </div>
                <div class="text-sm text-subtleText">
                  {{ conversation.messageCount || 0 }} messages •
                  {{ formatDate(conversation.updatedAt ?? undefined) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="text-subtleText hover:text-accent p-1 transition-colors"
                  title="Rename conversation"
                  @click.stop="handleRenameConversation(conversation)"
                >
                  <i class="i-weui:pencil-outlined" />
                </button>
                <button
                  class="text-subtleText hover:text-error p-1 transition-colors"
                  title="Delete conversation"
                  @click.stop="onDeleteConversation(conversation)"
                >
                  <i class="i-weui:delete-outlined" />
                </button>
              </div>
            </div>

            <div
              v-if="filteredConversations.length === 0"
              class="flex flex-col items-center justify-center p-8 text-subtleText"
            >
              <i class="i-bi:chat-left text-4xl mb-2 opacity-50" />
              <p class="text-center">
                {{ searchQuery ? 'No conversations found' : 'No conversations yet' }}
              </p>
            </div>
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
            <h4 class="text-md font-medium text-deepText">
              Messages in "{{ currentConversationTitle }}"
            </h4>

            <template v-if="messagesLoading">
              <div class="flex justify-center items-center flex-1">
                <div
                  class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
                />
              </div>
            </template>

            <template v-else>
              <ActiveChatItem
                v-for="message in selectedConversationMessages"
                :key="message.id"
                v-bind="message"
                :data-message-id="message.id"
                :show-rewrite="false"
                @delete="handleDeleteMessage"
                @update="handleUpdateMessage"
              />

              <div
                v-if="selectedConversationMessages.length === 0"
                class="text-center text-subtleText p-4"
              >
                No messages in this conversation
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Case: No messages selected -->
      <div
        v-else
        class="flex flex-col gap-2 h-full overflow-y-auto"
      >
        <h3 class="text-lg font-medium text-deepText">Conversations</h3>

        <div
          v-for="conversation in filteredConversations"
          :key="conversation.id ?? -1"
          class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
          :class="{ 'bg-accent/10 border-accent': conversation.id === currentConversationId }"
          @click="onSwitchConversation(conversation)"
        >
          <div class="flex-1">
            <div class="font-medium text-deepText">
              {{ conversation.title }}
            </div>
            <div class="text-sm text-subtleText">
              {{ conversation.messageCount || 0 }} messages •
              {{ formatDate(conversation.updatedAt ?? undefined) }}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-subtleText hover:text-accent p-1 transition-colors"
              title="Rename conversation"
              @click.stop="handleRenameConversation(conversation)"
            >
              <i class="i-weui:pencil-outlined" />
            </button>
            <button
              class="text-subtleText hover:text-error p-1 transition-colors"
              title="Delete conversation"
              @click.stop="onDeleteConversation(conversation)"
            >
              <i class="i-weui:delete-outlined" />
            </button>
          </div>
        </div>

        <div
          v-if="filteredConversations.length === 0"
          class="flex flex-col items-center justify-center p-8 text-subtleText"
        >
          <i class="i-bi:chat-left text-4xl mb-2 opacity-50" />
          <p class="text-center">
            {{ searchQuery ? 'No conversations found' : 'No conversations yet' }}
          </p>
          <p class="text-xs mt-2 text-center">
            Use the "New Chat" button above to start a conversation
          </p>
        </div>
      </div>
    </div>

    <div
      v-if="error"
      class="flex-none bg-panel border border-error rounded-md p-3 mx-4 mb-4"
    >
      <div class="flex items-center gap-2 text-error">
        <i class="i-weui:error-outlined" />
        <span class="text-sm">{{ error }}</span>
      </div>
    </div>

    <!-- Rename Dialog -->
    <div
      v-if="renameDialog.show"
      class="fixed inset-0 bg-slate/80 flex items-center justify-center z-50"
      @click.self="cancelRename"
    >
      <div class="bg-panel border border-borderMuted rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-medium mb-4 text-deepText">Rename Conversation</h3>
        <TextItem
          v-model:value="renameDialog.title"
          placeholder="Enter new title"
          max-height="44px"
          class="mb-4"
          @keydown.enter.exact.prevent="confirmRename"
          @keydown.escape.prevent="cancelRename"
        />
        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-2 text-subtleText hover:text-deepText transition-colors"
            @click="cancelRename"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 bg-accent text-slate rounded-md hover:bg-accentHover transition-colors"
            :disabled="!renameDialog.title.trim()"
            @click="confirmRename"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, inject, nextTick, watch, useTemplateRef } from 'vue'
import { type Conversation } from '@babadeluxe/shared'
import { type ConsoleLogger } from '@simwai/utils'
import { onClickOutside } from '@vueuse/core'
import ActiveChatItem from '../components/ActiveChatItem.vue'
import { useConversation } from '@/composables/use-conversation'
import { type SearchService } from '@/search-service'
import TextItem from '@/components/TextItem.vue'
import { KEY_VALUE_STORE_KEY, LOGGER_KEY, SEARCH_SERVICE_KEY } from '@/injection-keys'
import { useSearch } from '@/composables/use-search'
import { type KeyValueStore } from '@/database/key-value-store'
import { useResizableSplit } from '@/composables/use-resizable-split'

const logger: ConsoleLogger = inject(LOGGER_KEY)!
const searchService: SearchService = inject(SEARCH_SERVICE_KEY)!
const keyValueStore: KeyValueStore = inject(KEY_VALUE_STORE_KEY)!

const { searchResults, isSearching, performSearch } = useSearch(searchService)

const {
  messages,
  conversations,
  currentConversationId,
  isLoading,
  error,
  loadMessages,
  loadConversations,
  deleteConversation,
  switchConversation,
  deleteMessage,
  addOrUpdateMessage,
  updateConversationTitle,
} = useConversation()

const {
  containerRef: splitContainerRef,
  leftWidthPercent: splitLeftWidthPercent,
  rightWidthPercent: splitRightWidthPercent,
  isDragging: splitIsDragging,
  startDragging: splitStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'history-split-ratio',
  defaultRatio: 35,
  minRatio: 25,
  maxRatio: 65,
})

const {
  containerRef: verticalContainerRef,
  leftWidthPercent: verticalTopHeightPercent,
  rightWidthPercent: verticalBottomHeightPercent,
  isDragging: verticalIsDragging,
  startDragging: verticalStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'history-vertical-split-ratio',
  defaultRatio: 50,
  minRatio: 30,
  maxRatio: 70,
  direction: 'vertical',
})

const searchQuery = ref('')
const messagesLoading = ref(false)
const highlightedIndex = ref(-1)
const dropdownRef = useTemplateRef('dropdownRef')

const renameDialog = ref({
  show: false,
  conversation: null as Conversation | null,
  title: '',
})

onMounted(async () => {
  try {
    await loadMessages()
    await loadConversations()
  } catch (error) {
    logger.error('Failed to load conversations:', error as Error)
  }
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
  return currentConversationId.value > 0 && selectedConversationMessages.value.length > 0
})

const truncateText = (text: string, maxLength = 150) => {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

const handleSearch = () => {
  logger.log('Searching for:', searchQuery.value)
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
  try {
    const success = await addOrUpdateMessage(content, 'user', messageId)
    if (!success) {
      logger.error('Failed to update message')
    }
  } catch (error) {
    logger.error('Error updating message:', error as Error)
  }
}

const formatDate = (date: Date | undefined) => {
  if (!date) return 'Unknown'
  try {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      'day'
    )
  } catch {
    return date.toLocaleDateString()
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
    onSearchResultClick(searchResults.value[highlightedIndex.value])
  }
}

type AnySearchResult = {
  id?: number
  resultType: 'conversation' | 'message'
  [k: string]: unknown
}

const isMessageResult = (
  r: AnySearchResult
): r is {
  id: number
  conversationId: number
  content: string
  resultType: 'message'
} =>
  r.resultType === 'message' && 'conversationId' in r && 'content' in r && typeof r.id === 'number'

const isConversationResult = (
  r: AnySearchResult
): r is {
  id: number
  title: string
  resultType: 'conversation'
} => r.resultType === 'conversation' && 'title' in r && typeof r.id === 'number'

const _searchNavigating = ref(false)
const targetMessageId = ref<number | null>(null)

const onSearchResultClick = async (result: AnySearchResult) => {
  if (_searchNavigating.value) return
  _searchNavigating.value = true
  try {
    if (isMessageResult(result)) {
      const mid = Number(result.id)
      const cid = Number(result.conversationId)
      await navigateToMessage(mid, cid)
    } else if (isConversationResult(result)) {
      const cid = Number(result.id)
      await switchToConversation(cid)
    }

    // Just clear it synchronously - Vue batches DOM updates anyway
    searchQuery.value = ''

    // Or if you need deferred execution, use Vue's timing:
    nextTick(() => {
      searchQuery.value = ''
    })
  } finally {
    _searchNavigating.value = false
  }
}

const navigateToMessage = async (messageId: number | string, conversationId: number | string) => {
  const cid = Number(conversationId)
  const mid = Number(messageId)
  if (Number.isNaN(cid) || Number.isNaN(mid)) return

  targetMessageId.value = mid
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

  targetMessageId.value = null
}

const getSearchResultSubtitle = (result: AnySearchResult) => {
  if (isConversationResult(result)) return 'Conversation'
  if (isMessageResult(result)) {
    const found = conversations.value.find((c) => c.id === result.conversationId)
    const title = found?.title || 'Unknown'

    return `Message in "${title}"`
  }

  return 'Result'
}

const getSearchResultMainText = (result: AnySearchResult) => {
  if (isConversationResult(result)) return (result as { title: string }).title
  if (isMessageResult(result)) return truncateText((result as { content: string }).content)
  return ''
}

const onSwitchConversation = async (conversation: Conversation) => {
  if (conversation.id == null) return
  await switchToConversation(conversation.id)
}

const onDeleteConversation = async (conversation: Conversation) => {
  if (conversation.id == null) return
  await handleDeleteConversation(conversation.id)
}

watch(
  [conversations, filteredConversations, isLoading, searchQuery],
  ([convs, filtered, loading, query]) => {
    logger.log(
      '🔍 HistoryView State:',
      JSON.stringify({
        conversationsTotal: convs.length,
        filteredCount: filtered.length,
        isLoading: loading,
        searchQuery: query,
        conversationsData: convs,
      })
    )
  },
  { immediate: true }
)

watch(
  searchResults,
  (newResults) => {
    // TODO Add support for printing objects to logger
    logger.log('Search results updated:', JSON.stringify(newResults))
  },
  { immediate: true }
)

watch(searchQuery, () => {
  highlightedIndex.value = -1
})
</script>
