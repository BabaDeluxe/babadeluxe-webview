<template>
  <section
    id="chat"
    data-testid="chat-view-container"
    :data-models-loaded-count="modelsLoadedCount"
    class="flex flex-col w-full h-full bg-slate overflow-x-hidden"
  >
    <div
      v-if="messages.length === 0"
      class="flex flex-col gap-0 px-4 py-6 w-full items-center"
    >
      <AvatarItem role="user" />
      <div class="inline-flex h-full items-center justify-center text-xl text-deepText pt-2">
        {{ `Hello ${currentUsername}, what's on your mind today?` }}
      </div>
    </div>
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
    <div class="flex flex-col flex-1 min-h-0">
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
              :data-testid="'model-selector'"
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
      <div
        v-else-if="messages.length === 0"
        class="flex flex-col items-center justify-center p-8 text-subtleText"
      >
        <i class="i-bi:chat-left-dots text-6xl mb-4 opacity-50" />
        <h3 class="text-lg font-medium mb-2 text-deepText">Start a conversation</h3>
        <p class="text-sm">Ask me anything to begin!</p>
      </div>
      <div
        v-if="messages.length > 0"
        class="flex-1 overflow-y-auto px-4 min-h-0"
      >
        <div class="flex flex-col gap-0 max-w-full md:max-w-4xl mx-auto">
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
import { useRoute } from 'vue-router'
import { ResultAsync } from 'neverthrow'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import AvatarItem from '@/components/AvatarItem.vue'
import ActiveChatItem from '@/components/ActiveChatItem.vue'
import DropdownSelector, { type DropdownItem } from '@/components/DropdownSelector.vue'
import TextItem from '@/components/TextItem.vue'
import ButtonItem from '@/components/ButtonItem.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import type { KeyValueStore } from '@/database/key-value-store'
import type { Message } from '@/database/types'
import UpsellModal from '@/components/UpsellModal.vue'
import { useChatSocket } from '@/composables/use-chat-socket'
import { useConversation, type Mutable } from '@/composables/use-conversation'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import router from '@/routes.js'
const defaultModel = 'gemini:gemini-2.5-flash'
const commitIntervalMs = 2000
type ActiveChatItemInstance = InstanceType<typeof ActiveChatItem>
const logger = inject<ConsoleLogger>(LOGGER_KEY)!
const keyValueStore = inject<KeyValueStore>(KEY_VALUE_STORE_KEY)!
const supabase = inject<SupabaseClient>(SUPABASE_CLIENT_KEY)!

const route = useRoute()
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
const textInputRef = useTemplateRef<HTMLElement>('textInput')
const messageComponents = ref<Map<number, ActiveChatItemInstance>>(new Map())
const modelsReloadWarning = ref<string>()
const persistenceWarning = ref<string>()
const isSendingMessage = ref(false)
const promptOptions = computed<DropdownItem[]>(() => {
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

  return prompts.value.map(
    (prompt): DropdownItem => ({
      label: prompt.isSystem ? `${prompt.name} (System)` : prompt.name,
      value: prompt.command ?? '',
      disabled: !prompt.command,
    })
  )
})
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

  let lastCommitTime = Date.now()

  await resendFromMessage(messageId, {
    provider,
    model,
    systemPrompt: systemPromptText,
    existingAssistantId: nextMessage.id,
    onChunk: (assistantMsgId: number) => {
      const msg = messages.value.find((m) => m.id === assistantMsgId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      if (!msg.isStreaming) msg.isStreaming = true

      const now = Date.now()
      if (now - lastCommitTime > commitIntervalMs) {
        commitStreamingBuffer(assistantMsgId)
        lastCommitTime = now
      }
    },
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

  let lastCommitTime = Date.now()

  await rewriteWithModel(assistantMessageId, newModelId, {
    systemPrompt: systemPromptText,
    onChunk: (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      if (!msg.isStreaming) msg.isStreaming = true

      const now = Date.now()
      if (now - lastCommitTime > commitIntervalMs) {
        commitStreamingBuffer(messageId)
        lastCommitTime = now
      }
    },
    onComplete: async (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      commitStreamingBuffer(messageId)
      msg.isStreaming = false
      messageComponents.value.delete(messageId)
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

  const messageContent = currentMessage.value
  currentMessage.value = ''
  isSendingMessage.value = true

  const selectedPromptObject = prompts.value.find(
    (prompt) => prompt.command === currentPrompt.value
  )
  const systemPromptText = selectedPromptObject?.template || undefined

  let lastCommitTime = Date.now()

  const result = await sendConversationMessage(messageContent, {
    provider,
    model: selectedModel,
    systemPrompt: systemPromptText,
    onChunk: (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      if (!msg.isStreaming) msg.isStreaming = true

      const now = Date.now()
      if (now - lastCommitTime > commitIntervalMs) {
        commitStreamingBuffer(messageId)
        lastCommitTime = now
      }
    },
    onComplete: async (messageId: number) => {
      const msg = messages.value.find((message) => message.id === messageId) as
        | Mutable<Message>
        | undefined
      if (!msg) return

      commitStreamingBuffer(messageId)
      msg.isStreaming = false

      const finalizeResult = await finalizeAssistantMessage(messageId, msg.content)
      if (finalizeResult.isErr()) {
        logger.error('Failed to persist assistant message:', finalizeResult.error.message)
        conversationError.value = 'Failed to persist assistant message'
      }

      messageComponents.value.delete(messageId)
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

  isSendingMessage.value = false

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
  },
  { immediate: true }
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
