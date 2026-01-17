<template>
  <section
    id="chat"
    data-testid="chat-view-container"
    :data-models-loaded-count="modelsLoadedCount"
    class="flex flex-col lg:max-w-80vw mx-auto h-full bg-slate overflow-x-hidden rounded"
  >
    <EmptyState
      v-if="messages.length === 0"
      :greeting="`Hello ${currentUsername}, what's on your mind today?`"
    />

    <BaseAlertList :banners="activeBaseAlerts" />

    <div class="flex flex-col w-full h-full">
      <div
        v-if="messages.length === 0"
        data-testid="empty-state-input-section"
        class="flex flex-col gap-0 px-4 py-2"
      >
        <ChatInput
          ref="ChatInputRef"
          v-model="currentMessage"
          :disabled="isLoadingConversation || isLoadingMessage"
          :is-loading="isLoadingConversation || isLoadingMessage"
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
        </ChatInput>
      </div>

      <div
        v-if="messages.length === 0 && isLoadingConversation"
        class="flex flex-col flex-1 w-full justify-center p-8"
      >
        <BaseSpinner
          message="Loading conversation..."
          size="medium"
        />
      </div>

      <BaseEmptyState
        v-else-if="messages.length === 0"
        icon="i-bi:chat-left-dots"
        title="Start a conversation"
        description="Ask me anything to begin!"
      />

      <div
        v-if="messages.length > 0"
        class="flex flex-col flex-1 w-full overflow-y-auto"
      >
        <div class="flex flex-col flex-1 gap-0">
          <ChatMessage
            v-for="message in messages"
            :key="message.id"
            :ref="(element) => registerMessageComponent(message.id, element as Element)"
            v-bind="message"
            @delete="handleDeleteMessage"
            @update="handleUpdateMessage"
            @rewrite="handleRewriteMessage"
          />
        </div>
      </div>

      <div
        v-if="messages.length > 0"
        data-testid="message-list-input-section"
        class="flex flex-col gap-0 pr-2 pl-2 pt-4 pb-4"
      >
        <ChatInput
          ref="ChatInputRef"
          v-model="currentMessage"
          :disabled="isLoadingConversation || isLoadingMessage"
          :is-loading="isLoadingConversation || isLoadingMessage"
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
import { inject, onMounted, ref, useTemplateRef, watch, computed } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsoleLogger } from '@simwai/utils'
import { useRoute, useRouter } from 'vue-router'
import { ResultAsync } from 'neverthrow'
import EmptyState from '@/components/BaseEmptyState.vue'
import BaseEmptyState from '@/components/BaseEmptyState.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import ChatInput from '@/components/ChatInput.vue'
import ChatInputControls from '@/components/ChatInputControls.vue'
import ChatMessage from '@/components/ChatMessage.vue'
import BaseAlertList from '@/components/BaseAlertList.vue'
import SubscriptionModal from '@/components/SubscriptionModal.vue'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import type { KeyValueStore } from '@/database/key-value-store'
import type { Message } from '@/database/types'
import { useChatSocket } from '@/composables/use-chat-socket'
import { useConversation, type Mutable } from '@/composables/use-conversation'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { defaultModel, streamingCommitIntervalMs } from '@/constants'
import { createStreamingCommitHandler, finalizeStreamingMessage } from '@/streaming-helpers'

type ChatMessageInstance = InstanceType<typeof ChatMessage>

const logger = inject<ConsoleLogger>(LOGGER_KEY)!
const keyValueStore = inject<KeyValueStore>(KEY_VALUE_STORE_KEY)!
const supabase = inject<SupabaseClient>(SUPABASE_CLIENT_KEY)!

const route = useRoute()
const router = useRouter()

const {
  initialize,
  messages,
  currentConversationId,
  isLoading: isLoadingConversation,
  error: conversationError,
  updateUserMessage,
  deleteMessage,
  generateConversationTitle,
  updateConversationTitle,
  sendMessage: sendConversationMessage,
  resendFromMessage,
  rewriteWithModel,
  createConversation,
  finalizeAssistantMessage,
} = useConversation()

const {
  isStreaming: isChatStreaming,
  error: chatError,
  streamingMessageIds,
  abortMessage: abortChatMessage,
} = useChatSocket()

const currentStreamingMessageId = computed(() =>
  streamingMessageIds.value.length > 0 ? streamingMessageIds.value[0] : null
)

const { groupedModels, isLoadingModels, modelsError, modelsLoadedCount } = useModelsSocket()
const {
  prompts,
  isLoading: isLoadingPrompts,
  error: promptsError,
  clearError: clearPromptsError,
} = usePromptsSocket()

const { shouldShowModal, dismissModal } = useSubscriptionSocket()

const currentPrompt = ref('BabaSeniorDev™')
const currentModel = ref(defaultModel)
const currentMessage = ref('')
const currentUsername = ref('User')
const chatInputRef = useTemplateRef<InstanceType<typeof ChatInput>>('chatInputRef')
const messageComponents = ref<Map<number, ChatMessageInstance>>(new Map())
const modelsReloadWarning = ref<string>()
const persistenceWarning = ref<string>()
const isLoadingMessage = ref(false)

const baseAlerts = computed(() => [
  {
    id: 'conversation-error',
    message: conversationError.value,
    type: 'error' as const,
    dismissible: true,
    onClose: () => {
      conversationError.value = undefined
    },
  },
  {
    id: 'chat-error',
    message: chatError.value,
    type: 'error' as const,
    dismissible: false,
    onClose: () => {},
  },
  {
    id: 'models-error',
    message: modelsError.value,
    type: 'warning' as const,
    dismissible: true,
    onClose: () => {
      modelsError.value = undefined
    },
  },
  {
    id: 'prompts-error',
    message: promptsError.value,
    type: 'warning' as const,
    dismissible: true,
    onClose: clearPromptsError,
  },
  {
    id: 'models-reload-warning',
    message: modelsReloadWarning.value,
    type: 'warning' as const,
    dismissible: true,
    onClose: () => {
      modelsReloadWarning.value = undefined
    },
  },
  {
    id: 'persistence-warning',
    message: persistenceWarning.value,
    type: 'warning' as const,
    dismissible: true,
    onClose: () => {
      persistenceWarning.value = undefined
    },
  },
])

const activeBaseAlerts = computed(() =>
  baseAlerts.value.filter((banner) => banner.message !== undefined)
)

const promptOptions = computed(() => {
  if (isLoadingPrompts.value) {
    return [
      {
        label: 'Loading Prompts...',
        value: '',
        disabled: true,
      },
    ]
  }

  if (promptsError.value) {
    return [
      {
        label: 'Error loading prompts',
        value: '',
        disabled: true,
      },
    ]
  }

  return prompts.value.map((prompt) => ({
    label: prompt.isSystem ? `${prompt.name} (System)` : prompt.name,
    value: prompt.command ?? '',
    disabled: !prompt.command,
  }))
})

const registerMessageComponent = (id: number, element: Element | ChatMessageInstance | null) => {
  if (!element) {
    messageComponents.value.delete(id)
    return
  }
  if ('$' in (element as Element | ChatMessageInstance))
    messageComponents.value.set(id, element as ChatMessageInstance)
}

const fetchUsername = async (): Promise<void> => {
  const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) => {
    const errorMessage =
      unknownError instanceof Error ? unknownError.message : 'Failed to fetch user'
    return new Error(errorMessage)
  })

  getUserResult.match(
    (response) => {
      const user = response.data.user
      const githubIdentity = user?.identities?.find((id) => id.provider === 'github')

      if (githubIdentity?.identity_data?.login) {
        currentUsername.value = githubIdentity.identity_data.login as string
      } else if (user?.user_metadata?.username) {
        currentUsername.value = user.user_metadata.username as string
      }
    },
    (fetchError) => {
      logger.error('Error fetching username:', fetchError.message)
    }
  )
}

const loadPersistedSettings = async (): Promise<void> => {
  const promptResult = await keyValueStore.get('chat-prompt')
  if (promptResult.isErr()) return
  if (promptResult.value !== undefined) currentPrompt.value = promptResult.value

  const modelResult = await keyValueStore.get('chat-model')
  if (modelResult.isErr()) return
  if (modelResult.value !== undefined) currentModel.value = modelResult.value
}

const handleDeleteMessage = async (messageId: number) => {
  await deleteMessage(messageId)
}

async function handleUpdateMessage(messageId: number, newContent: string) {
  const updateResult = await updateUserMessage(messageId, newContent)
  if (updateResult.isErr()) {
    logger.error('Failed to update message:', updateResult.error.message)
    conversationError.value = 'Failed to update message'
    return
  }

  const userMessageIndex = messages.value.findIndex((message) => message.id === messageId)
  if (userMessageIndex === -1 || userMessageIndex >= messages.value.length - 1) {
    return
  }

  const nextMessage = messages.value[userMessageIndex + 1]
  if (nextMessage.role !== 'assistant') return

  let provider: string
  let model: string

  if (nextMessage.model) {
    ;[provider, model] = nextMessage.model.split(':')
    if (!provider || !model) {
      conversationError.value = 'Invalid model format'
      return
    }
  } else {
    logger.warn(`Message ${nextMessage.id} missing model, using current selection`)
    if (!currentModel.value || !currentModel.value.includes(':')) {
      conversationError.value = 'Please select a valid model'
      return
    }
    ;[provider, model] = currentModel.value.split(':')
  }

  const selectedPromptObject = prompts.value.find((p) => p.command === currentPrompt.value)
  const systemPromptText = selectedPromptObject?.template || nextMessage.systemPrompt

  const handleChunk = createStreamingCommitHandler(
    messages,
    messageComponents,
    streamingCommitIntervalMs
  )

  await resendFromMessage(messageId, {
    provider,
    model,
    systemPrompt: systemPromptText,
    existingAssistantId: nextMessage.id,
    onChunk: handleChunk,
    onError: (errorResult: Error) => {
      logger.error('Failed to regenerate after edit:', errorResult.message)
      conversationError.value = errorResult.message
    },
  })
}

async function handleRewriteMessage(assistantMessageId: number, newModelId: string) {
  const selectedPromptObject = prompts.value.find(
    (prompt) => prompt.command === currentPrompt.value
  )
  const systemPromptText = selectedPromptObject?.template || undefined

  const handleChunk = createStreamingCommitHandler(
    messages,
    messageComponents,
    streamingCommitIntervalMs
  )

  await rewriteWithModel(assistantMessageId, newModelId, {
    systemPrompt: systemPromptText,
    onChunk: handleChunk,
    onComplete: async (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      finalizeStreamingMessage(messageId, messageComponents)
      msg.isStreaming = false
    },
    onError: (error: Error) => {
      logger.error('Failed to rewrite message:', error.message)
      conversationError.value = error.message
    },
  })
}

async function handleSendMessage(): Promise<void> {
  if (
    !currentMessage.value.trim() ||
    isLoadingConversation.value ||
    isChatStreaming.value ||
    isLoadingMessage.value
  )
    return

  if (currentConversationId.value === 0) {
    const result = await createConversation('New Conversation')

    if (result.isErr()) {
      conversationError.value = `Cannot send message: ${result.error.message}`
      logger.error(`Failed to auto-create conversation: ${result.error.message}`)
      return
    }

    logger.log(`Auto-created conversation ${result.value} for first message`)
  }

  if (!currentModel.value || !currentModel.value.includes(':')) {
    conversationError.value = 'Please select a valid model first'
    return
  }

  const [provider, selectedModel] = currentModel.value.split(':')
  if (!provider || !selectedModel) {
    conversationError.value = 'Invalid model format'
    return
  }

  const messageContent = currentMessage.value
  currentMessage.value = ''
  isLoadingMessage.value = true

  const selectedPromptObject = prompts.value.find(
    (prompt) => prompt.command === currentPrompt.value
  )
  const systemPromptText = selectedPromptObject?.template || undefined

  const handleChunk = createStreamingCommitHandler(
    messages,
    messageComponents,
    streamingCommitIntervalMs
  )

  const result = await sendConversationMessage(messageContent, {
    provider,
    model: selectedModel,
    systemPrompt: systemPromptText,
    onChunk: handleChunk,
    onComplete: async (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      finalizeStreamingMessage(messageId, messageComponents)
      msg.isStreaming = false

      const finalizeResult = await finalizeAssistantMessage(messageId, msg.content)
      if (finalizeResult.isErr()) {
        logger.error('Failed to persist assistant message:', finalizeResult.error.message)
        conversationError.value = 'Failed to persist assistant message'
      }

      if (messages.value.length === 2) {
        const newTitle = generateConversationTitle(messageContent)
        await updateConversationTitle(currentConversationId.value, newTitle)
      }
    },
    onError: (error: Error) => {
      logger.error('Failed to stream assistant response:', error.message)
      conversationError.value = error.message
    },
  })

  isLoadingMessage.value = false

  if (result.isErr()) {
    currentMessage.value = messageContent
  }
}

const handleAbortMessage = async (): Promise<void> => {
  if (!currentStreamingMessageId.value) return

  const messageId = currentStreamingMessageId.value
  const result = await abortChatMessage(messageId)

  await result.match(
    async () => {
      chatInputRef.value?.textInputRef?.focus()
      logger.log('Message aborted successfully after user clicked stop button')
    },
    (abortError) => {
      logger.error('Failed to abort message after user clicked stop button:', abortError.message)
    }
  )
}

const handleModalClose = () => {
  dismissModal()
  logger.log('User dismissed upgrade modal')
}

onMounted(async () => {
  const initResult = await ResultAsync.fromPromise(
    (async () => {
      await initialize()
      await Promise.all([fetchUsername(), loadPersistedSettings()])
    })(),
    (unknownError) =>
      new Error(unknownError instanceof Error ? unknownError.message : 'Initialization failed')
  )

  initResult.match(
    () => {
      logger.log('Chat initialized successfully')
    },
    (initError) => {
      logger.error('Failed to initialize chat on page load:', initError.message)
      conversationError.value = 'Failed to initialize chat. Please refresh the page.'
    }
  )
})

watch(
  () => route.query.newConversation,
  async (isNew) => {
    if (isNew === 'true') {
      await createConversation('New Conversation')
      await router.replace({ query: {} })
    }
  }
)

watch(
  groupedModels,
  (newModelGroups) => {
    if (!newModelGroups || newModelGroups.length === 0) return
    for (const modelGroup of newModelGroups) {
      if (modelGroup.items.length <= 0) continue

      const preferredModel =
        modelGroup.items.find((model) => model.label.toLowerCase().includes('flash-2.0')) ||
        modelGroup.items.find((model) => model.label.toLowerCase().includes('flash')) ||
        modelGroup.items[0]
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
    logger.error(
      'Failed to persist prompt selection after user changed dropdown:',
      result.error.message
    )
    persistenceWarning.value = 'Failed to save your prompt selection. It may reset after refresh.'
  }
})

watch(currentModel, async (newValue) => {
  const result = await keyValueStore.set('chat-model', newValue)

  if (result.isErr()) {
    logger.error(
      'Failed to persist model selection after user changed dropdown:',
      result.error.message
    )
    persistenceWarning.value = 'Failed to save your model selection. It may reset after refresh.'
  }
})
</script>
