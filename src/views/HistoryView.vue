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

    <div class="flex flex-col flex-1 min-h-0 w-full overflow-hidden px-4 pt-4">
      <template v-if="areSelectedMessagesShown">
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
              :current-conversation-id="selectedConversationId ?? -1"
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
              :current-conversation-id="selectedConversationId ?? -1"
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
          :current-conversation-id="selectedConversationId ?? -1"
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
import ConversationList from '@/components/ConversationList.vue'
import MessageList from '@/components/MessageList.vue'
import BaseModal from '@/components/BaseModal.vue'
import BaseAlert from '@/components/BaseAlert.vue'
import SearchResultsDropdown from '@/components/SearchResultsDropdown.vue'
import BaseTextField from '@/components/BaseTextField.vue'
import { useHistory } from '@/composables/use-history'

defineOptions({ name: 'HistoryView' })

const {
  // conversations,
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
  currentConversationTitle,
  areSelectedMessagesShown,

  searchQuery,
  searchResults,
  isSearching,
  highlightedIndex,
  // dropdownRef,
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
  // handleDeleteConversation,
  onSwitchConversation,
  onDeleteConversation,
  renameDialog,

  handleDeleteMessage,
  handleEditMessage,
} = useHistory()
</script>
