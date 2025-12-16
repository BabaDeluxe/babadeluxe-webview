<template>
  <section
    id="chat"
    data-testid="chat-view-container"
    class="flex flex-col w-full h-full bg-slate overflow-x-hidden"
  >
    <!-- Header with Avatar (only when no messages) -->
    <div
      v-if="messages.length === 0"
      class="flex flex-col gap-0 px-4 py-6 w-full items-center"
    >
      <AvatarItem role="user" />
      <div class="inline-flex h-full items-center justify-center text-xl text-deepText pt-2">
        {{ `Hello ${currentUsername}, what's on your mind today?` }}
      </div>
    </div>

    <!-- Error Banners for each source -->
    <ErrorBanner
      :message="conversationError"
      type="error"
      @close="conversationError = undefined"
    />
    <ErrorBanner
      :message="chatError"
      type="error"
      @close="chatError = undefined"
    />
    <ErrorBanner
      :message="modelsError"
      type="warning"
      @close="modelsError = undefined"
    />
    <ErrorBanner
      :message="promptsError"
      type="warning"
      @close="clearPromptsError"
    />
    <ErrorBanner
      :message="modelsReloadWarning"
      type="warning"
      @close="modelsReloadWarning = undefined"
    />
    <ErrorBanner
      :message="persistenceWarning"
      type="warning"
      @close="persistenceWarning = undefined"
    />

    <!-- Main Content Area -->
    <div class="flex flex-col flex-1 min-h-0">
      <!-- Input at Top (only when no messages) -->
      <div
        v-if="messages.length === 0"
        data-testid="empty-state-input-section"
        class="flex flex-col gap-0 px-4 py-2"
      >
        <TextItem
          ref="textInput"
          v-model:value="currentMessage"
          style="w-0"
          placeholder="How can I help you today?"
          data-testid="chat-message-input-top"
          :disabled="isLoadingConversation || isSendingMessage"
          @keydown.enter.exact.prevent="handleSendMessage"
        />
        <div
          class="flex xs:flex-row flex-col justify-start xs:justify-center items-center border border-borderMuted rounded bg-panel overflow-hidden"
        >
          <div class="flex flex-1">
            <DropdownSelector
              v-model="currentPrompt"
              icon="i-bi:chat-left"
              :items="promptOptions"
            />
            <DropdownSelector
              v-model="currentModel"
              icon="i-simple-icons:openai"
              :groups="groupedModels"
              :disabled="isLoadingModels"
            />
          </div>
          <ButtonItem
            v-if="!isChatStreaming"
            icon="i-bi:play-circle"
            data-testid="chat-send-button-top"
            :class="'bg-transparent text-accent hover:bg-transparent hover:text-accent/80 rounded-none border-0 shrink-0'"
            :disabled="!currentMessage.trim() || isSendingMessage"
            :loading="isLoadingConversation || isSendingMessage"
            @click="handleSendMessage"
          >
            <template #loading>
              <div class="w-5 h-5">
                <DotLottieVue
                  :style="'height: 20px; width: 20px'"
                  autoplay
                  loop
                  src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie"
                />
              </div>
            </template>
          </ButtonItem>
          <ButtonItem
            v-else
            icon="i-bi:stop-circle"
            data-testid="chat-abort-button-top"
            :class="'bg-transparent text-error hover:bg-transparent hover:text-error/80 rounded-none border-0 shrink-0'"
            @click="handleAbortMessage"
          />
        </div>
      </div>

      <!-- Loading State (No Messages) -->
      <div
        v-if="isLoadingConversation && messages.length === 0"
        class="flex justify-center p-8"
      >
        <div class="flex items-center gap-2 text-subtleText">
          <div class="w-8 h-8">
            <DotLottieVue
              :style="'height: 32px; width: 32px'"
              autoplay
              loop
              src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie"
            />
          </div>
          <span>Loading conversation...</span>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="messages.length === 0"
        class="flex flex-col items-center justify-center p-8 text-subtleText"
      >
        <i class="i-bi:chat-left-dots text-6xl mb-4 opacity-50" />
        <h3 class="text-lg font-medium mb-2 text-deepText">Start a conversation</h3>
        <p class="text-sm">Ask me anything to begin!</p>
      </div>

      <!-- Messages List (with scrolling) -->
      <div
        v-if="messages.length > 0"
        class="flex-1 overflow-y-auto px-4 min-h-0"
      >
        <div class="flex flex-col gap-0 max-w-4xl mx-auto">
          <ActiveChatItem
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

      <!-- Input at Bottom (when messages exist) -->
      <div
        v-if="messages.length > 0"
        data-testid="message-list-input-section"
        class="flex flex-col gap-0 p-4 border-t border-borderMuted"
      >
        <TextItem
          ref="textInput"
          v-model:value="currentMessage"
          placeholder="How can I help you today?"
          data-testid="chat-message-input-bottom"
          :disabled="isLoadingConversation || isSendingMessage"
          @keydown.enter.exact.prevent="handleSendMessage"
        />
        <div
          class="flex xs:flex-row flex-col justify-start xs:justify-center items-center border border-borderMuted rounded bg-panel overflow-hidden"
        >
          <div class="flex flex-1">
            <DropdownSelector
              v-model="currentPrompt"
              icon="i-bi:chat-left"
              :items="promptOptions"
            />
            <DropdownSelector
              v-model="currentModel"
              icon="i-simple-icons:openai"
              :groups="groupedModels"
              :disabled="isLoadingModels"
            />
          </div>
          <ButtonItem
            v-if="!isChatStreaming"
            icon="i-bi:play-circle"
            data-testid="chat-send-button-bottom"
            class="bg-transparent text-accent hover:bg-transparent hover:text-accent/80 rounded-none border-0 shrink-0"
            :disabled="!currentMessage.trim() || isSendingMessage"
            :loading="isLoadingConversation || isSendingMessage"
            @click="handleSendMessage"
          >
            <template #loading>
              <div class="w-5 h-5">
                <DotLottieVue
                  :style="'height: 20px; width: 20px'"
                  autoplay
                  loop
                  src="https://lottie.host/61eb14b2-5dd2-471a-88c3-9e9c61862e83/Rldo3dbFyi.lottie"
                />
              </div>
            </template>
          </ButtonItem>
          <ButtonItem
            v-else
            icon="i-bi:stop-circle"
            data-testid="chat-abort-button-bottom"
            class="bg-transparent text-error hover:bg-transparent hover:text-error/80 rounded-none border-0 shrink-0"
            @click="handleAbortMessage"
          />
        </div>
      </div>
    </div>

    <!-- Upsell Modal Overlay -->
    <UpsellModal
      :is-visible="shouldShowModal"
      @close="handleModalClose"
    />
  </section>
</template>

<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import { inject, onMounted, ref, useTemplateRef, watch, computed } from 'vue'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsoleLogger } from '@simwai/utils'
import { ResultAsync } from 'neverthrow'
import AvatarItem from '@/components/AvatarItem.vue'
import ActiveChatItem from '@/components/ActiveChatItem.vue'
import DropdownSelector from '@/components/DropdownSelector.vue'
import TextItem from '@/components/TextItem.vue'
import ButtonItem from '@/components/ButtonItem.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { useConversation } from '@/composables/use-conversation'
import { useChatSocket } from '@/composables/use-chat-socket'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import type { KeyValueStore } from '@/database/key-value-store'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import type { Message } from '@/database/types'
import UpsellModal from '@/components/UpsellModal.vue'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'

// Constants
const defaultModel = 'gemini:gemini-2.5-flash'
const commitIntervalMs = 2000
const commitChunkThreshold = 500

// Types
type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}
type ActiveChatItemInstance = InstanceType<typeof ActiveChatItem>

// Injections
const logger = inject<ConsoleLogger>(LOGGER_KEY)!
const keyValueStore = inject<KeyValueStore>(KEY_VALUE_STORE_KEY)!
const supabase = inject<SupabaseClient>(SUPABASE_CLIENT_KEY)!

// Composables
const {
  messages,
  currentConversationId,
  isLoading: isLoadingConversation,
  error: conversationError,
  loadConversations,
  initializeCurrentConversation,
  addOrUpdateMessage,
  deleteMessage,
  generateConversationTitle,
  updateConversationTitle,
  debouncedAutoSave,
} = useConversation()

const {
  isStreaming: isChatStreaming,
  error: chatError,
  streamingMessageIds,
  sendMessage: sendChatMessage,
  abortMessage: abortChatMessage,
} = useChatSocket()

const currentStreamingMessageId = computed(() =>
  streamingMessageIds.value.length > 0 ? streamingMessageIds.value[0] : null
)

const { groupedModels, isLoadingModels, modelsError } = useModelsSocket()
const {
  prompts,
  isLoading: isLoadingPrompts,
  error: promptsError,
  clearError: clearPromptsError,
} = usePromptsSocket()
const { shouldShowModal, dismissModal } = useSubscriptionSocket()

// State Refs
const currentPrompt = ref('BabaSeniorDev™')
const currentModel = ref(defaultModel)
const currentMessage = ref('')
const currentUsername = ref('User')
const textInputRef = useTemplateRef<HTMLElement>('textInput')
const messageComponents = ref<Map<number, ActiveChatItemInstance>>(new Map())
const modelsReloadWarning = ref<string>()
const persistenceWarning = ref<string>()
const isSendingMessage = ref(false)

// Computed Properties
const promptOptions = computed(() => {
  if (isLoadingPrompts.value) {
    return [{ label: 'Loading Prompts...', value: '', disabled: true }]
  }
  if (promptsError.value) {
    return [{ label: 'Error loading prompts', value: '', disabled: true }]
  }
  return prompts.value.map((prompt) => ({
    label: prompt.isSystem ? `${prompt.name} (System)` : prompt.name,
    value: prompt.command,
  }))
})

// Methods
const registerMessageComponent = (id: number, element: Element | ActiveChatItemInstance | null) => {
  if (!element) {
    messageComponents.value.delete(id)
    return
  }
  if ('$' in (element as Element | ActiveChatItemInstance))
    messageComponents.value.set(id, element as ActiveChatItemInstance)
}

const commitStreamingBuffer = (messageId: number): void => {
  const componentInstance = messageComponents.value.get(messageId)
  if (componentInstance?.markdownRef) componentInstance.markdownRef.commitContent()
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

const handleUpdateMessage = async (messageId: number, content: string) => {
  await addOrUpdateMessage(content, 'user', messageId)
}

const handleRewriteMessage = async (messageId: number, modelId: string) => {
  logger.log('Rewrite message', messageId.toString(), 'with model', modelId)
}

const buildPrompt = (messages: Message[], newMessage: string, systemPrompt: string): string => {
  let prompt = `${systemPrompt}\n\n`
  for (const msg of messages) {
    if (msg.content.trim()) {
      prompt += `${msg.role}: ${msg.content}\n\n`
    }
  }
  prompt += `user: ${newMessage}\n\nassistant:`
  return prompt
}

const handleSendMessage = async (): Promise<void> => {
  if (
    !currentMessage.value.trim() ||
    isLoadingConversation.value ||
    isChatStreaming.value ||
    isSendingMessage.value
  )
    return

  if (!currentModel.value || !currentModel.value.includes(':')) {
    conversationError.value = 'Please select a valid model first'
    return
  }

  const [provider, selectedModel] = currentModel.value.split(':')
  if (!provider || !selectedModel) {
    conversationError.value = 'Invalid model format'
    return
  }

  isSendingMessage.value = true

  const messageContent = currentMessage.value
  currentMessage.value = ''

  const userMessageResult = await ResultAsync.fromPromise(
    addOrUpdateMessage(messageContent, 'user'),
    (error) => new Error(error instanceof Error ? error.message : 'Failed to create user message')
  )

  if (userMessageResult.isErr()) {
    logger.error(
      'Failed to save user message after user clicked send button:',
      userMessageResult.error.message
    )
    currentMessage.value = messageContent
    isSendingMessage.value = false
    return
  }

  const userMessage = userMessageResult.value
  if (!userMessage || userMessage === true) {
    logger.error('User message creation returned invalid value after send button click')
    currentMessage.value = messageContent
    isSendingMessage.value = false
    return
  }

  if (messages.value.length === 1) {
    const newTitle = generateConversationTitle(messageContent)
    const updateTitleResult = await ResultAsync.fromPromise(
      updateConversationTitle(currentConversationId.value, newTitle),
      (error) => new Error(error instanceof Error ? error.message : 'Failed to update title')
    )

    if (updateTitleResult.isErr()) {
      logger.warn(
        'Failed to update conversation title after first message:',
        updateTitleResult.error.message
      )
    }
  }

  const assistantMessageResult = await ResultAsync.fromPromise(
    addOrUpdateMessage('', 'assistant'),
    (error) =>
      new Error(error instanceof Error ? error.message : 'Failed to create assistant message')
  )

  if (assistantMessageResult.isErr()) {
    logger.error(
      'Failed to create assistant message after user sent message:',
      assistantMessageResult.error.message
    )
    conversationError.value = 'Failed to create assistant message'
    isSendingMessage.value = false
    return
  }

  const assistantMessage = assistantMessageResult.value
  if (!assistantMessage || assistantMessage === true) {
    logger.error('Assistant message creation returned invalid value after user sent message')
    conversationError.value = 'Failed to create assistant message'
    isSendingMessage.value = false
    return
  }

  isSendingMessage.value = false

  const systemPromptText = 'You are a senior software engineer assistant.'
  const fullPrompt = buildPrompt(messages.value.slice(0, -1), messageContent, systemPromptText)

  let streamedContent = ''
  let lastCommitTime = Date.now()
  let lastCommitLength = 0

  const streamResult = await sendChatMessage(
    assistantMessage.id,
    provider,
    selectedModel,
    fullPrompt,
    (chunk) => {
      logger.log(
        `Received chunk: ${chunk.substring(0, 30)} for message: `,
        assistantMessage.id.toString()
      )
      streamedContent += chunk
      const msg = messages.value.find((m) => m.id === assistantMessage.id) as
        | Mutable<Message>
        | undefined

      if (msg) {
        msg.content = streamedContent
        if (!msg.isStreaming) msg.isStreaming = true

        const now = Date.now()
        const charsSinceCommit = streamedContent.length - lastCommitLength
        if (now - lastCommitTime > commitIntervalMs || charsSinceCommit > commitChunkThreshold) {
          commitStreamingBuffer(assistantMessage.id)
          lastCommitTime = now
          lastCommitLength = streamedContent.length
        }
        debouncedAutoSave(assistantMessage.id, streamedContent)
      }
    }
  )

  await streamResult.match(
    async () => {
      const msg = messages.value.find((message) => message.id === assistantMessage.id) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      commitStreamingBuffer(assistantMessage.id)
      msg.content = streamedContent
      msg.isStreaming = false
      await addOrUpdateMessage(streamedContent, 'assistant', msg.id)
      messageComponents.value.delete(assistantMessage.id)
    },
    async (streamError) => {
      logger.error(
        'Failed to stream assistant response after user sent message:',
        streamError.message
      )
      await deleteMessage(assistantMessage.id)
    }
  )
}

const handleAbortMessage = async (): Promise<void> => {
  if (!currentStreamingMessageId.value) return

  const messageId = currentStreamingMessageId.value
  const result = await abortChatMessage(messageId)

  await result.match(
    async () => {
      textInputRef.value?.focus()
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
      await loadConversations()
      await Promise.all([initializeCurrentConversation(), fetchUsername(), loadPersistedSettings()])
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
  groupedModels,
  (newModelGroups) => {
    if (!newModelGroups || newModelGroups.length === 0) return
    for (const modelGroup of newModelGroups) {
      if (modelGroup.items.length > 0) {
        const preferredModel =
          modelGroup.items.find((model) => model.label.toLowerCase().includes('flash-2.0')) ||
          modelGroup.items.find((model) => model.label.toLowerCase().includes('flash')) ||
          modelGroup.items[0]
        if (preferredModel) {
          currentModel.value = preferredModel.value
          return
        }
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
