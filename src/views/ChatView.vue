<template>
  <section
    id="chat"
    data-testid="chat-view-container"
    :data-models-loaded-count="modelsLoadedCount"
    class="flex flex-col flex-1 min-h-0 lg:max-w-80vw mx-auto w-full bg-slate overflow-x-hidden rounded"
  >
    <!-- Preload LLM icons -->
    <div
      class="i-simple-icons:openai i-simple-icons:anthropic i-ri:gemini-line i-simple-icons:ollama i-hugeicons:deepseek hidden"
    />
    <BaseAlertList :banners="activeBaseAlerts" />

    <div class="flex flex-col flex-1 min-h-0 w-full">
      <!-- Empty state input section -->
      <div
        v-if="messages.length === 0"
        data-testid="empty-state-input-section"
        class="flex flex-col gap-2 px-4 pt-8"
      >
        <ContextRootBar
          v-if="isInVsCode && isContextRootBarVisible"
          @hide="isContextRootBarVisible = false"
        />

        <ContextPanel
          v-if="isInVsCode"
          :items="contextItems"
          :has-error="!!contextError"
          :is-loading="isLoadingContext"
          :is-root-bar-visible="isContextRootBarVisible"
          @toggle-root-bar="handleToggleRootBar"
          @remove-item="handleRemoveContextItem"
          @clear-all="handleClearAllContext"
          @toggle-lock="handleToggleLock"
        />

        <ChatInput
          ref="chatInputRef"
          v-model="currentMessage"
          :is-disabled="isLoadingConversations || isLoadingMessages"
          :is-loading="isLoadingConversations || isLoadingMessages"
          :is-submitting="isChatStreaming"
          placeholder="How can I help you today?"
          test-id="chat-message-input-top"
          submit-button-test-id="chat-send-button-top"
          abort-button-test-id="chat-abort-button-top"
          @submit="handleSendMessage"
          @abort="handleAbortMessage"
        >
          <template #controls>
            <ChatInputControls
              v-model:prompt="currentPrompt"
              v-model:model="currentModel"
              :prompt-options="promptOptions"
              :model-groups="groupedModels"
              :is-loading-models="isLoadingModels"
            />
          </template>

          <template #footer>
            <div
              v-if="contextUsageWarning"
              class="mt-1 text-xs text-subtleText"
            >
              {{ contextUsageWarning }}
              <div class="mt-1 h-1 w-full bg-borderMuted rounded overflow-hidden">
                <div
                  class="h-full bg-accent transition-all"
                  :style="{ width: `${Math.round(lastContextUsage * 100)}%` }"
                />
              </div>
            </div>
          </template>
        </ChatInput>
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
        <ContextRootBar
          v-if="isInVsCode && isContextRootBarVisible"
          @hide="isContextRootBarVisible = false"
        />

        <ContextPanel
          v-if="isInVsCode"
          :items="contextItems"
          :has-error="!!contextError"
          :is-loading="isLoadingContext"
          :is-root-bar-visible="isContextRootBarVisible"
          @toggle-root-bar="handleToggleRootBar"
          @remove-item="handleRemoveContextItem"
          @clear-all="handleClearAllContext"
          @toggle-lock="handleToggleLock"
        />

        <ChatInput
          ref="chatInputRef"
          v-model="currentMessage"
          :is-disabled="isLoadingConversations || isLoadingMessages"
          :is-loading="isLoadingConversations || isLoadingMessages"
          :is-submitting="isChatStreaming"
          placeholder="How can I help you today?"
          test-id="chat-message-input-bottom"
          submit-button-test-id="chat-send-button-bottom"
          abort-button-test-id="chat-abort-button-bottom"
          @submit="handleSendMessage"
          @abort="handleAbortMessage"
        >
          <template #controls>
            <ChatInputControls
              v-model:prompt="currentPrompt"
              v-model:model="currentModel"
              :prompt-options="promptOptions"
              :model-groups="groupedModels"
              :is-loading-models="isLoadingModels"
            />
          </template>

          <template #footer>
            <div
              v-if="contextUsageWarning"
              class="mt-1 text-xs text-subtleText"
            >
              {{ contextUsageWarning }}
              <div class="mt-1 h-1 w-full bg-borderMuted rounded overflow-hidden">
                <div
                  class="h-full bg-accent transition-all"
                  :style="{ width: `${Math.round(lastContextUsage * 100)}%` }"
                />
              </div>
            </div>
          </template>
        </ChatInput>
      </div>
    </div>

    <SubscriptionModal
      :is-visible="shouldShowModal"
      @close="handleModalClose"
    />
  </section>
</template>

<script setup lang="ts">
import ChatInput from '@/components/ChatInput.vue'
import ChatMessage from '@/components/ChatMessage.vue'
import BaseAlertList from '@/components/BaseAlertList.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import ContextPanel from '@/components/ContextPanel.vue'
import ContextRootBar from '@/components/ContextRootBar.vue'
import SubscriptionModal from '@/components/SubscriptionModal.vue'
import ChatInputControls from '@/components/ChatInputControls.vue'
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
  activeBaseAlerts,
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
</script>
