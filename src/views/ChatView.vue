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
          :is-disabled="isLoadingConversations || isLoadingMessage"
          :is-loading="isLoadingConversations || isLoadingMessage"
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
                  :style="{ width: `${Math.round(store.lastContextUsage * 100)}%` }"
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
          :is-disabled="isLoadingConversations || isLoadingMessage"
          :is-loading="isLoadingConversations || isLoadingMessage"
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
                  :style="{ width: `${Math.round(store.lastContextUsage * 100)}%` }"
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
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ResultAsync } from 'neverthrow'
import BaseAlertList from '@/components/BaseAlertList.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import ChatInput from '@/components/ChatInput.vue'
import ChatInputControls from '@/components/ChatInputControls.vue'
import ChatMessage from '@/components/ChatMessage.vue'
import ContextPanel from '@/components/ContextPanel.vue'
import ContextRootBar from '@/components/ContextRootBar.vue'
import SubscriptionModal from '@/components/SubscriptionModal.vue'
import { useChatSocket } from '@/composables/use-chat-socket'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import {
  useVsCodeContextStore,
  type LockedContextReference,
} from '@/stores/use-vs-code-context-store'
import { useConversationStore } from '@/stores/use-conversation-store'
import { defaultModel, streamingCommitIntervalMs } from '@/constants'
import type { ContextReference } from '@/database/types'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { createStreamingCommitHandler, finalizeStreamingMessage } from '@/streaming-helpers'
import { safeInject } from '@/safe-inject'
import { AuthError, InitializationError } from '@/errors'
import { findPreferredModel } from '@/model-preferences'
import { isVsCodeContextItem } from '@/vs-code/context-type-guards'

defineOptions({ name: 'ChatView' })

type ChatMessageInstance = InstanceType<typeof ChatMessage>

type FormattedContextItem = { kind: 'file' | 'snippet'; filePath: string; content: string }

type BaseAlertBanner = {
  id: string
  message: string | undefined
  type: 'error' | 'warning'
  isDismissible: boolean
  onClose: () => void
}

const logger = safeInject(LOGGER_KEY)
const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
const supabase = safeInject(SUPABASE_CLIENT_KEY)

const route = useRoute()
const router = useRouter()

const store = useConversationStore()

const {
  messages,
  currentConversationId,
  isLoadingConversations,
  error: conversationError,
  selectedModelContextWindow,
} = storeToRefs(store)

const {
  initialize,
  updateUserMessage,
  deleteMessage,
  generateConversationTitle,
  updateConversationTitle,
  sendMessage: sendConversationMessage,
  resendFromMessage,
  rewriteWithModel,
  createConversation,
  finalizeAssistantMessage,
} = store

const {
  isStreaming: isChatStreaming,
  error: chatError,
  streamingMessageIds,
  abortMessage: abortChatMessage,
} = useChatSocket()

const currentStreamingMessageId = computed(() =>
  streamingMessageIds.value.length > 0 ? streamingMessageIds.value[0] : undefined
)

const { groupedModels, isLoadingModels, modelsError, modelsLoadedCount } = useModelsSocket()

const {
  prompts,
  isLoading: isLoadingPrompts,
  error: promptsError,
  clearError: clearPromptsError,
} = usePromptsSocket()

const { shouldShowModal, dismissModal } = useSubscriptionSocket()

const vsCodeContext = useVsCodeContextStore()

const { isInVsCode, contextItems, contextError, contextRevision, isLoadingContext } =
  storeToRefs(vsCodeContext)

const {
  toggleLocked,
  refreshSuggestions,
  getLockedReferences,
  resolveFilesFromDocument,
  removeContextItem,
  clearAllContext,
} = vsCodeContext

const currentPrompt = ref('BabaSeniorDev™')
const currentModel = ref(defaultModel)
const currentMessage = ref('')
const currentUsername = ref('User')
const currentUserId = ref<string>()
const isContextRootBarVisible = ref(true)

const chatInputRef = useTemplateRef<InstanceType<typeof ChatInput>>('chatInputRef')
const messageComponents = ref<Map<number, ChatMessageInstance>>(new Map())

const modelsReloadWarning = ref<string>()
const persistenceWarning = ref<string>()
const contextUsageWarning = computed(() => {
  const usage = store.lastContextUsage
  if (usage >= 0.8) {
    return 'This conversation is close to the model’s context limit. Older messages will be truncated.'
  }
  if (usage >= 0.6) {
    return 'This conversation is getting long; earlier messages may be dropped soon.'
  }
  return ''
})

const isLoadingMessage = ref(false)

/* ------------------------------ Alerts ------------------------------ */

const dismissConversationError = () => {
  conversationError.value = undefined
}
const dismissContextError = () => {
  contextError.value = undefined
}
const dismissModelsError = () => {
  modelsError.value = undefined
}
const dismissModelsReloadWarning = () => {
  modelsReloadWarning.value = undefined
}
const dismissPersistenceWarning = () => {
  persistenceWarning.value = undefined
}

const baseAlerts = ref<BaseAlertBanner[]>([
  {
    id: 'conversation-error',
    message: undefined,
    type: 'error',
    isDismissible: true,
    onClose: dismissConversationError,
  },
  {
    id: 'chat-error',
    message: undefined,
    type: 'error',
    isDismissible: false,
    onClose: () => {},
  },
  {
    id: 'context-error',
    message: undefined,
    type: 'warning',
    isDismissible: true,
    onClose: dismissContextError,
  },
  {
    id: 'models-error',
    message: undefined,
    type: 'warning',
    isDismissible: true,
    onClose: dismissModelsError,
  },
  {
    id: 'prompts-error',
    message: undefined,
    type: 'warning',
    isDismissible: true,
    onClose: clearPromptsError,
  },
  {
    id: 'models-reload-warning',
    message: undefined,
    type: 'warning',
    isDismissible: true,
    onClose: dismissModelsReloadWarning,
  },
  {
    id: 'persistence-warning',
    message: undefined,
    type: 'warning',
    isDismissible: true,
    onClose: dismissPersistenceWarning,
  },
])

const setBaseAlertMessage = (id: string, message: string | undefined) => {
  const banner = baseAlerts.value.find((alert) => alert.id === id)
  if (!banner) return
  banner.message = message
}

watch(
  conversationError,
  (value) => {
    setBaseAlertMessage('conversation-error', value)
  },
  { immediate: true }
)
watch(
  chatError,
  (value) => {
    setBaseAlertMessage('chat-error', value)
  },
  { immediate: true }
)
watch(
  contextError,
  (value) => {
    setBaseAlertMessage('context-error', value)
  },
  { immediate: true }
)
watch(
  modelsError,
  (value) => {
    setBaseAlertMessage('models-error', value)
  },
  { immediate: true }
)
watch(
  promptsError,
  (value) => {
    setBaseAlertMessage('prompts-error', value)
  },
  { immediate: true }
)
watch(
  modelsReloadWarning,
  (value) => {
    setBaseAlertMessage('models-reload-warning', value)
  },
  { immediate: true }
)
watch(
  persistenceWarning,
  (value) => {
    setBaseAlertMessage('persistence-warning', value)
  },
  { immediate: true }
)

const activeBaseAlerts = computed(() =>
  baseAlerts.value.filter((banner) => banner.message !== undefined)
)

/* ------------------------------ Prompt options ------------------------------ */

const promptOptions = computed(() => {
  if (isLoadingPrompts.value) {
    return [{ label: 'Loading Prompts...', value: '', isDisabled: true }]
  }

  if (promptsError.value) {
    return [{ label: 'Error loading prompts', value: '', isDisabled: true }]
  }

  return prompts.value.map((prompt) => ({
    label: prompt.isSystem ? `${prompt.name} (System)` : prompt.name,
    value: prompt.command ?? '',
    isDisabled: !prompt.isActive,
  }))
})

/* ------------------------------ Helpers ------------------------------ */

const getSelectedSystemPromptText = (fallback: string | undefined): string | undefined => {
  const selectedPromptObject = prompts.value.find(
    (prompt) => prompt.command === currentPrompt.value
  )
  return selectedPromptObject?.template || fallback
}

const registerMessageComponent = (id: number, element: Element | ChatMessageInstance | null) => {
  if (!element) {
    messageComponents.value.delete(id)
    return
  }

  if ('$' in (element as Element | ChatMessageInstance)) {
    messageComponents.value.set(id, element as ChatMessageInstance)
  }
}

type PreparedChatRequest = {
  contextReferences: ContextReference[]
  contextItems: FormattedContextItem[]
  onChunk: ReturnType<typeof createStreamingCommitHandler>
}

function toContextReference(ref: LockedContextReference): ContextReference | undefined {
  if (ref.kind === 'file') {
    const cleaned = ref.filePath.trim()
    if (!cleaned) return undefined
    return { type: 'file', filePath: cleaned }
  }

  const cleanedSnippet = ref.snippetText.trim()
  if (!cleanedSnippet) return undefined

  const cleanedPath = ref.filePath.trim()
  return cleanedPath.length > 0
    ? { type: 'snippet', filePath: cleanedPath, snippetText: cleanedSnippet }
    : { type: 'snippet', snippetText: cleanedSnippet }
}

const prepareChatRequest = async (): Promise<PreparedChatRequest> => {
  const locked = getLockedReferences()

  const lockedFilePaths = locked.filter((ref) => ref.kind === 'file').map((ref) => ref.filePath)

  const lockedSnippets = locked
    .filter((ref) => ref.kind === 'snippet')
    .map((ref) => ({
      filePath: ref.filePath,
      snippetText: ref.snippetText,
    }))

  const resolvedFilesResult = await resolveFilesFromDocument(lockedFilePaths)
  const resolvedFiles = resolvedFilesResult.isOk() ? resolvedFilesResult.value : []

  const contextReferences: ContextReference[] = locked
    .map(toContextReference)
    .filter((ref): ref is ContextReference => ref !== undefined)

  const contextItems: FormattedContextItem[] = [
    ...resolvedFiles.map((file) => ({
      kind: 'file' as const,
      filePath: file.filePath,
      content: file.content,
    })),
    ...lockedSnippets.map((snippet) => ({
      kind: 'snippet' as const,
      filePath: snippet.filePath,
      content: snippet.snippetText,
    })),
  ]

  const onChunk = createStreamingCommitHandler(
    messages,
    messageComponents,
    streamingCommitIntervalMs
  )

  return { contextReferences, contextItems, onChunk }
}

const shouldRestoreFocusAfterAbort = (): boolean => {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement)) return false

  return (
    activeElement.closest('[data-testid="chat-abort-button-top"]') !== null ||
    activeElement.closest('[data-testid="chat-abort-button-bottom"]') !== null
  )
}

/* ------------------------------ Core handlers ------------------------------- */

const fetchUsername = async (): Promise<void> => {
  const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) => {
    if (unknownError instanceof Error) {
      return new AuthError(unknownError.message, unknownError)
    }
    return new AuthError('Failed to fetch user', unknownError)
  })

  getUserResult.match(
    (response) => {
      const user = response.data.user

      if (user?.id) currentUserId.value = user.id

      const githubIdentity = user?.identities?.find((id) => id.provider === 'github')

      if (githubIdentity?.identity_data?.login) {
        currentUsername.value = githubIdentity.identity_data.login as string
      } else if (user?.user_metadata?.username) {
        currentUsername.value = user.user_metadata.username as string
      }
    },
    (fetchError) => {
      logger.error('Failed to fetch user details', {
        error: fetchError,
      })
    }
  )
}

const loadPersistedSettings = async (): Promise<void> => {
  const promptResult = await keyValueStore.get('chat-prompt')
  if (promptResult.isOk() && promptResult.value !== undefined) {
    currentPrompt.value = promptResult.value
  }

  const modelResult = await keyValueStore.get('chat-model')
  if (modelResult.isOk() && modelResult.value !== undefined) {
    currentModel.value = modelResult.value
  }
}

const handleDeleteMessage = async (messageId: number) => {
  const result = await deleteMessage(messageId)

  if (result.isErr()) {
    logger.error('Failed to delete message', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      messageId,
      error: result.error,
    })
    conversationError.value = result.error.message
  }
}

const handleRemoveContextItem = (payload: unknown) => {
  if (isVsCodeContextItem(payload)) {
    removeContextItem(payload)
    return
  }

  if (typeof payload === 'string') {
    const item = contextItems.value.find((i) => i.id === payload)
    if (item) {
      removeContextItem(item)
      return
    }

    logger.warn('Context item removal failed: unknown id', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      itemId: payload,
    })
    return
  }

  logger.warn('Context item removal failed: unsupported payload', {
    conversationId: currentConversationId.value,
    userId: currentUserId.value,
    payload: JSON.stringify(payload),
  })
}

const handleClearAllContext = () => {
  clearAllContext()
}

const handleToggleLock = (filePath: string) => {
  toggleLocked(filePath)
}

const parseModel = (value: string | undefined): { provider: string; model: string } | null => {
  if (!value || !value.includes(':')) return null
  const [provider, model] = value.split(':')
  return provider && model ? { provider, model } : null
}

const handleRegenerateError = (message: string, extra: Record<string, unknown> = {}) => {
  logger.warn(message, {
    conversationId: currentConversationId.value,
    userId: currentUserId.value,
    ...extra,
  })
  conversationError.value = message
}

async function handleEditMessage(messageId: number, newContent: string) {
  const updateResult = await updateUserMessage(messageId, newContent)
  if (updateResult.isErr()) {
    logger.error('Failed to update message on edit', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      messageId,
      error: updateResult.error,
    })
    conversationError.value = updateResult.error.message
    return
  }

  const userMessageIndex = messages.value.findIndex((m) => m.id === messageId)
  const nextMessage = messages.value[userMessageIndex + 1]

  if (!nextMessage || nextMessage.role !== 'assistant') return

  const fromCurrent = parseModel(currentModel.value)
  if (!fromCurrent) {
    handleRegenerateError('Please select a valid model', {
      messageId,
      currentModel: currentModel.value,
    })
    return
  }

  const { provider, model } = fromCurrent!

  const systemPromptText = getSelectedSystemPromptText(nextMessage.systemPrompt)
  const prepared = await prepareChatRequest()

  await resendFromMessage(messageId, {
    provider,
    model,
    systemPrompt: systemPromptText,
    existingAssistantId: nextMessage.id,
    contextItems: prepared.contextItems,
    contextReferences: prepared.contextReferences,
    onChunk: prepared.onChunk,
    onError: (errorResult: unknown) => {
      const errorMessage = 'Failed to regenerate message after edit'
      const asError = createError(errorMessage, errorResult)

      logger.error(errorMessage, {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        messageId,
        assistantMessageId: nextMessage.id,
        error: asError,
      })
      conversationError.value = asError.message
    },
  })
}

async function handleRewriteMessage(assistantMessageId: number, newModelId: string) {
  const systemPromptText = getSelectedSystemPromptText(undefined)
  const prepared = await prepareChatRequest()

  await rewriteWithModel(assistantMessageId, newModelId, {
    systemPrompt: systemPromptText,
    contextItems: prepared.contextItems,
    contextReferences: prepared.contextReferences,
    onChunk: prepared.onChunk,
    onComplete: async (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId)
      if (!msg) return

      finalizeStreamingMessage(messageId, messageComponents)
      msg.isStreaming = false
    },
    onError: (error: Error) => {
      logger.error('Failed to rewrite message with new model', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        assistantMessageId,
        newModelId,
        error,
      })
      conversationError.value = error.message
    },
  })
}

const ensureConversation = async (): Promise<boolean> => {
  if (currentConversationId.value !== 0) return true

  const result = await createConversation('New Conversation')
  if (result.isErr()) {
    logger.error('Failed to auto-create conversation for first message', {
      userId: currentUserId.value,
      error: result.error,
    })
    conversationError.value = result.error.message
    return false
  }

  logger.log('Auto-created conversation for first message', {
    conversationId: result.value,
    userId: currentUserId.value,
  })
  return true
}

const ensureModel = (): { provider: string; model: string } | null => {
  const value = currentModel.value
  if (!value || !value.includes(':')) {
    logger.warn('Cannot send message: no valid model selected', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      currentModel: value,
    })
    conversationError.value = 'Please select a valid model first'
    return null
  }

  const [provider, model] = value.split(':')
  if (!provider || !model) {
    logger.warn('Cannot send message: invalid model format', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      currentModel: value,
    })
    conversationError.value = 'Invalid model format'
    return null
  }

  return { provider, model }
}

const createError = (fallback: string, errorResult: unknown): Error =>
  errorResult instanceof Error
    ? errorResult
    : new Error(typeof errorResult === 'string' ? errorResult : fallback)

let streamingAssistantId: number | undefined

const cleanupStreamingMessage = async () => {
  if (streamingAssistantId == null) return

  const msg = messages.value.find((m) => m.id === streamingAssistantId)
  if (msg) msg.isStreaming = false

  const deleteResult = await deleteMessage(streamingAssistantId)
  if (deleteResult.isErr()) {
    logger.error('Failed to delete failed assistant message', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      messageId: streamingAssistantId,
      error: deleteResult.error,
    })
  }
}

async function handleSendMessage(): Promise<void> {
  if (
    !currentMessage.value.trim() ||
    isLoadingConversations.value ||
    isChatStreaming.value ||
    isLoadingMessage.value
  ) {
    return
  }

  if (!(await ensureConversation())) return

  const modelInfo = ensureModel()
  if (!modelInfo) return

  const { provider, model: selectedModel } = modelInfo

  const messageContent = currentMessage.value
  currentMessage.value = ''

  const revisionAtSendStart = contextRevision.value
  const systemPromptText = getSelectedSystemPromptText(undefined)
  const prepared = await prepareChatRequest()

  streamingAssistantId = undefined

  const result = await sendConversationMessage(messageContent, {
    provider,
    model: selectedModel,
    systemPrompt: systemPromptText,
    contextReferences: prepared.contextReferences,
    contextItems: prepared.contextItems,
    onChunk: prepared.onChunk,

    onComplete: async (messageId: number) => {
      streamingAssistantId = messageId

      const msg = messages.value.find((message) => message.id === messageId)
      if (!msg) return

      finalizeStreamingMessage(messageId, messageComponents)
      msg.isStreaming = false

      const finalizeResult = await finalizeAssistantMessage(messageId, msg.content)
      if (finalizeResult.isErr()) {
        logger.error('Failed to persist assistant message', {
          conversationId: currentConversationId.value,
          userId: currentUserId.value,
          messageId,
          error: finalizeResult.error,
        })
        conversationError.value = finalizeResult.error.message
      }

      if (messages.value.length !== 2) return

      const newTitle = generateConversationTitle(messageContent)
      const titleResult = await updateConversationTitle(currentConversationId.value, newTitle)
      if (titleResult.isErr()) {
        logger.warn('Failed to auto-generate conversation title', {
          conversationId: currentConversationId.value,
          userId: currentUserId.value,
          error: titleResult.error,
        })
      }
    },

    onError: async (errorResult: unknown) => {
      const errorText = 'Failed to stream assistant response'
      const asError = createError(errorText, errorResult)

      logger.error(errorText, {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        provider,
        model: selectedModel,
        error: asError,
      })
      conversationError.value = asError.message

      await cleanupStreamingMessage()
    },
  })

  if (result.isErr()) {
    const domainError = result.error

    logger.error('Failed to send message', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      provider,
      model: selectedModel,
      error: domainError,
    })

    conversationError.value = domainError.message
    currentMessage.value = messageContent

    await cleanupStreamingMessage()
    return
  }

  if (contextRevision.value !== revisionAtSendStart) {
    logger.log('Context changed during send, not clearing', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
    })
    return
  }

  clearAllContext()
}

const handleAbortMessage = async (): Promise<void> => {
  const messageId = currentStreamingMessageId.value
  if (!messageId) return

  const shouldRestoreFocus = shouldRestoreFocusAfterAbort()
  const result = await abortChatMessage(messageId)

  await result.match(
    async () => {
      if (shouldRestoreFocus) {
        await nextTick()
        chatInputRef.value?.focus()
      }
      logger.log('Message aborted successfully', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        messageId,
      })
    },
    async (abortError) => {
      logger.error('Failed to abort streaming message', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        messageId,
        error: abortError,
      })
      conversationError.value = abortError.message
    }
  )
}

const handleModalClose = () => {
  dismissModal()
  logger.log('Upgrade modal dismissed', {
    conversationId: currentConversationId.value,
    userId: currentUserId.value,
  })
}

const handleToggleRootBar = () => {
  isContextRootBarVisible.value = !isContextRootBarVisible.value
}

/* ------------------------------ Lifecycle init ------------------------------ */

onMounted(async () => {
  const initResult = await ResultAsync.fromPromise(
    (async () => {
      await initialize()
      await Promise.all([fetchUsername(), loadPersistedSettings()])
    })(),
    (unknownError) => {
      if (unknownError instanceof Error) {
        return new InitializationError(unknownError.message, unknownError)
      }
      return new InitializationError('Chat initialization failed', unknownError)
    }
  )

  initResult.match(
    () => {
      logger.log('Chat initialized successfully', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
      })
    },
    (initError) => {
      logger.error('Failed to initialize chat', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        error: initError,
      })
      conversationError.value = initError.message
    }
  )
})

/* ---------------------- Auto Context Suggestions ---------------------- */

let lastPreviewText = ''

watchDebounced(
  [currentMessage, isInVsCode, isChatStreaming, isLoadingConversations, isLoadingMessage],
  async ([text, inVsCode, streaming, loadingConversation, loadingMessage]) => {
    if (!inVsCode || streaming || loadingConversation || loadingMessage) return

    const trimmed = text.trim()
    if (trimmed === lastPreviewText) return
    lastPreviewText = trimmed

    const result = await refreshSuggestions(trimmed)
    if (result.isErr()) {
      logger.error('Failed to refresh context suggestions', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        messagePreview: trimmed.substring(0, 50),
        error: result.error,
      })
    }
  },
  { debounce: 450, maxWait: 1500 }
)

/* ------------------------------ Route watches ------------------------------- */

watch(
  () => route.query.newConversation,
  async (isNew) => {
    if (isNew !== 'true') return

    const result = await createConversation('New Conversation')
    if (result.isErr()) {
      logger.error('Failed to create new conversation from route', {
        userId: currentUserId.value,
        error: result.error,
      })
      conversationError.value = 'Failed to create conversation'
    }

    await router.replace({ query: {} })
  }
)

watch(
  groupedModels,
  (newModelGroups) => {
    if (!newModelGroups || newModelGroups.length === 0) return

    for (const modelGroup of newModelGroups) {
      if (modelGroup.items.length <= 0) continue

      const preferredModel = findPreferredModel(modelGroup.items)

      if (preferredModel) {
        currentModel.value = preferredModel.value
        return
      }
    }
  },
  { deep: true }
)

watch(currentPrompt, async (newValue) => {
  const result = await keyValueStore.set('chat-prompt', newValue)
  if (result.isErr()) {
    logger.error('Failed to persist prompt selection', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      promptValue: newValue,
      error: result.error,
    })
    persistenceWarning.value = 'Failed to save your prompt selection. It may reset after refresh.'
  }
})

watch(currentModel, async (newValue) => {
  const result = await keyValueStore.set('chat-model', newValue)
  if (result.isErr()) {
    logger.error('Failed to persist model selection', {
      conversationId: currentConversationId.value,
      userId: currentUserId.value,
      modelValue: newValue,
      error: result.error,
    })
    persistenceWarning.value = 'Failed to save your model selection. It may reset after refresh.'
  }
})

type ModelItem = {
  value: string
  contextWindow?: number
}

const findModelContextWindow = (fullValue: string): number | undefined => {
  if (!fullValue || !fullValue.includes(':')) return undefined

  const allItems: ModelItem[] = groupedModels.value.flatMap((group) => group.items as ModelItem[])
  const match = allItems.find((item) => item.value === fullValue)

  return match?.contextWindow
}

watch(
  currentModel,
  (newValue) => {
    const value = newValue?.trim()
    if (!value) {
      selectedModelContextWindow.value = undefined
      return
    }

    selectedModelContextWindow.value = findModelContextWindow(value)
  },
  { immediate: true }
)
</script>
