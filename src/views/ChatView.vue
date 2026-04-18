<template>
  <section
    id="chat"
    data-testid="chat-view-container"
    :data-models-loaded-count="modelsLoadedCount"
    class="flex flex-col flex-1 min-h-0 lg:max-w-80vw mx-auto w-full bg-slate overflow-x-hidden rounded"
  >
    <div class="flex flex-col flex-1 min-h-0 w-full">
      <!-- Empty state input section -->
      <div
        v-if="messages.length === 0"
        data-testid="empty-state-input-section"
        class="flex flex-col gap-2 px-4 pt-8"
      >
        <ChatInputBlock
          ref="chatInputTopRef"
          v-model="currentMessage"
          v-model:prompt="currentPrompt"
          v-model:model="currentModel"
          :is-in-vs-code="isInVsCode"
          :is-context-root-bar-visible="isContextRootBarVisible"
          :context-items="contextItems"
          :has-context-error="!!contextError"
          :is-loading-context="isLoadingContext"
          :is-disabled="isLoadingConversations || isLoadingMessages"
          :is-loading="isLoadingConversations || isLoadingMessages"
          :is-submitting="isChatStreaming"
          placeholder="How can I help you today?"
          test-id="chat-message-input-top"
          submit-button-test-id="chat-send-button-top"
          abort-button-test-id="chat-abort-button-top"
          :prompt-options="promptOptions"
          :grouped-models="groupedModels"
          :is-loading-models="isLoadingModels"
          :context-usage-warning="contextUsageWarning"
          :last-context-usage="lastContextUsage"
          @submit="handleSendMessage"
          @abort="handleAbortMessage"
          @hide-root-bar="isContextRootBarVisible = false"
          @toggle-root-bar="handleToggleRootBar"
          @remove-context-item="handleRemoveContextItem"
          @clear-all-context="handleClearAllContext"
          @toggle-lock="handleToggleLock"
        />
      </div>

      <!-- Loading state -->
      <div
        v-if="messages.length === 0 && isLoadingConversations"
        class="flex flex-col flex-1 w-full justify-center p-8"
      >
        <BaseSpinner
          message="Loading conversation..."
          size="medium"
        />
      </div>

      <!-- Empty state -->
      <BaseEmptyState
        v-else-if="messages.length === 0"
        icon="i-bi:chat-left-dots"
        :title="`Hello ${currentUsername}, what's on your mind today?`"
        description="Ask me anything to begin!"
      />

      <!-- Messages -->
      <div
        v-if="messages.length > 0"
        class="flex flex-col flex-1 min-h-0 w-full overflow-y-auto"
      >
        <div class="flex flex-col gap-0">
          <ChatMessage
            v-for="message in messages"
            :key="message.id"
            :ref="(element) => registerMessageComponent(message.id, element as Element)"
            v-bind="message"
            :is-edit-enabled="message.role === 'user'"
            :is-rewrite-enabled="message.role === 'assistant'"
            @delete="handleDeleteMessage"
            @update="handleEditMessage"
            @rewrite="handleRewriteMessage"
          />
        </div>
      </div>

      <!-- Message list input section -->
      <div
        v-if="messages.length > 0"
        data-testid="message-list-input-section"
        class="flex flex-col gap-2 pr-4 pl-4 pt-4 pb-4"
      >
        <ChatInputBlock
          ref="chatInputBottomRef"
          v-model="currentMessage"
          v-model:prompt="currentPrompt"
          v-model:model="currentModel"
          :is-in-vs-code="isInVsCode"
          :is-context-root-bar-visible="isContextRootBarVisible"
          :context-items="contextItems"
          :has-context-error="!!contextError"
          :is-loading-context="isLoadingContext"
          :is-disabled="isLoadingConversations || isLoadingMessages"
          :is-loading="isLoadingConversations || isLoadingMessages"
          :is-submitting="isChatStreaming"
          placeholder="How can I help you today?"
          test-id="chat-message-input-bottom"
          submit-button-test-id="chat-send-button-bottom"
          abort-button-test-id="chat-abort-button-bottom"
          :prompt-options="promptOptions"
          :grouped-models="groupedModels"
          :is-loading-models="isLoadingModels"
          :context-usage-warning="contextUsageWarning"
          :last-context-usage="lastContextUsage"
          @submit="handleSendMessage"
          @abort="handleAbortMessage"
          @hide-root-bar="isContextRootBarVisible = false"
          @toggle-root-bar="handleToggleRootBar"
          @remove-context-item="handleRemoveContextItem"
          @clear-all-context="handleClearAllContext"
          @toggle-lock="handleToggleLock"
        />
      </div>
    </div>

    <SubscriptionModal
      :is-visible="shouldShowModal"
      @close="handleModalClose"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ChatMessage from '@/components/ChatMessage.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import SubscriptionModal from '@/components/SubscriptionModal.vue'
import ChatInputBlock from '@/components/ChatInputBlock.vue'
import { useChat } from '@/composables/use-chat'

defineOptions({ name: 'ChatView' })

const {
  chatInputRef,
  messages,
  isLoadingConversations,
  isLoadingMessages,
  isChatStreaming,
  isInVsCode,
  contextItems,
  contextError,
  isLoadingContext,
  isContextRootBarVisible,
  currentMessage,
  currentPrompt,
  currentModel,
  currentUsername,
  promptOptions,
  groupedModels,
  isLoadingModels,
  modelsLoadedCount,
  contextUsageWarning,
  lastContextUsage,
  shouldShowModal,
  registerMessageComponent,
  handleSendMessage,
  handleAbortMessage,
  handleDeleteMessage,
  handleEditMessage,
  handleRewriteMessage,
  handleRemoveContextItem,
  handleClearAllContext,
  handleToggleLock,
  handleModalClose,
  handleToggleRootBar,
} = useChat()

const chatInputTopRef = ref<InstanceType<typeof ChatInputBlock>>()
const chatInputBottomRef = ref<InstanceType<typeof ChatInputBlock>>()

// Sync the focusable ref
watch([chatInputTopRef, chatInputBottomRef], () => {
  chatInputRef.value = chatInputTopRef.value || chatInputBottomRef.value
})
</script>
