import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchDebounced, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ResultAsync } from 'neverthrow'
import type ChatInput from '@/components/ChatInput.vue'
import type ChatMessage from '@/components/ChatMessage.vue'
import { useChatSocket } from '@/composables/use-chat-socket'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { useConversationStore } from '@/stores/use-conversation-store'
import { defaultModel, localStorageKeys } from '@/constants'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { finalizeStreamingMessage } from '@/streaming-helpers'
import { safeInject } from '@/safe-inject'
import { AuthError, InitializationError, ChatError, BaseError } from '@/errors'
import { findPreferredModel } from '@/model-preferences'
import { useChatAlerts } from '@/composables/use-chat-alerts'
import { useChatContextHandler } from '@/composables/use-chat-context-handler'
import { isOfflineMode } from '@/env-validator'

type ChatMessageInstance = InstanceType<typeof ChatMessage>
type ChatInputInstance = InstanceType<typeof ChatInput>

export type ModelItem = {
  label: string
  value: string
  provider: string
  contextWindow?: number
}

export type ModelGroup = {
  label: string
  items: ModelItem[]
}

export function useChat() {
  const logger = safeInject(LOGGER_KEY)
  const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)

  const route = useRoute()
  const router = useRouter()

  const store = useConversationStore()
  const {
    messages,
    error: conversationError,
    selectedModelContextWindow,
    lastContextUsage,
  } = storeToRefs(store)

  const {
    generateConversationTitle,
    updateConversationTitle,
    sendMessage: sendConversationMessage,
    resendFromMessage,
    rewriteWithModel,
    createConversation,
    finalizeAssistantMessage,
    loadConversations,
    loadMessages,
    loadMessageCounts,
    resumeInterruptedStreams,
  } = store

  const {
    isStreaming: isChatStreaming,
    streamingMessageIds,
    abortMessage: abortChatMessage,
  } = useChatSocket()

  const currentStreamingMessageId = computed(() =>
    streamingMessageIds.value.length > 0 ? streamingMessageIds.value[0] : undefined
  )

  const { groupedModels, isLoadingModels, modelsLoadedCount } = useModelsSocket()

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
  const currentUserId = ref<string>()
  const isContextRootBarVisible = ref(true)

  const chatInputRef = ref<ChatInputInstance>()
  const messageComponents = ref<Map<number, ChatMessageInstance>>(new Map())

  const currentConversationId = useStorage<number>(localStorageKeys.currentConversationId, 0)

  const {
    isInVsCode,
    contextItems,
    contextError,
    contextRevision,
    isLoadingContext,
    refreshSuggestions,
    prepareChatRequest,
    handleRemoveContextItem,
    handleClearAllContext,
    handleToggleLock,
    clearAllContext,
  } = useChatContextHandler(
    logger,
    currentConversationId,
    currentUserId,
    messages,
    messageComponents
  )

  const isLoadingConversations = ref(false)
  const isLoadingMessages = ref(false)

  const { persistenceWarning } = useChatAlerts(
    conversationError,
    contextError,
    promptsError,
    clearPromptsError
  )

  const contextUsageWarning = computed(() => {
    const usage = lastContextUsage.value
    if (usage >= 0.8) {
      return 'This conversation is close to the model’s context limit. Older messages will be truncated.'
    }
    if (usage >= 0.6) {
      return 'This conversation is getting long; earlier messages may be dropped soon.'
    }
    return ''
  })

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

  const getSelectedSystemPromptText = (fallback: string | undefined): string | undefined => {
    const selectedPromptObject = prompts.value.find(
      (prompt) => prompt.command === currentPrompt.value
    )
    return selectedPromptObject?.template || fallback
  }

  const registerMessageComponent = (id: number, component: ChatMessageInstance) => {
    messageComponents.value.set(id, component)
  }

  const handleDeleteMessage = async (messageId: number): Promise<void> => {
    const result = await store.deleteMessage(messageId)
    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const handleEditMessage = async (messageId: number, content: string): Promise<void> => {
    const result = await store.updateUserMessage(messageId, content)
    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const handleRewriteMessage = async (messageId: number): Promise<void> => {
    const result = await rewriteWithModel(
      currentConversationId.value,
      messageId,
      currentModel.value,
      {
        systemPrompt: getSelectedSystemPromptText(undefined),
      }
    )

    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const loadMessagesForCurrentConversation = async (): Promise<void> => {
    if (currentConversationId.value === 0) {
      messages.value = []
      return
    }

    isLoadingMessages.value = true
    const result = await loadMessages(currentConversationId.value)
    isLoadingMessages.value = false

    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const loadPersistedSettings = async (): Promise<void> => {
    const [promptResult, modelResult] = await Promise.all([
      keyValueStore.get('chat-prompt'),
      keyValueStore.get('chat-model'),
    ])

    if (promptResult.isOk() && promptResult.value) {
      currentPrompt.value = promptResult.value
    }

    if (modelResult.isOk() && modelResult.value) {
      currentModel.value = modelResult.value
    }
  }

  const fetchUsername = async (): Promise<void> => {
    if (isOfflineMode()) {
      currentUserId.value = 'offline-user'
      currentUsername.value = 'Simon Waiblinger'
      return
    }

    const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) =>
      unknownError instanceof Error
        ? new AuthError(unknownError.message, unknownError)
        : new AuthError('Failed to fetch user', unknownError)
    )

    getUserResult.match(
      (response) => {
        const user = response.data.user
        if (user?.id) currentUserId.value = user.id

        if (user?.app_metadata?.provider === 'github') {
          const githubIdentity = user.identities?.find((id) => id.provider === 'github')
          if (githubIdentity?.identity_data?.login) {
            currentUsername.value = githubIdentity.identity_data.login as string
            return
          }
        }

        if (user?.user_metadata?.username) {
          currentUsername.value = user.user_metadata.username as string
        } else if (user?.email) {
          currentUsername.value = user.email.split('@')[0]
        }
      },
      (error) => {
        logger.error('Failed to fetch user details for chat view', {
          error,
        })
      }
    )
  }

  const cleanupStreamingMessage = async (): Promise<void> => {
    if (currentStreamingMessageId.value) {
      await abortChatMessage(currentStreamingMessageId.value)
    }
  }

  const createError = (message: string, cause: unknown): BaseError => {
    if (cause instanceof BaseError) return cause
    return new ChatError(message, cause instanceof Error ? cause : undefined)
  }

  const shouldRestoreFocusAfterAbort = (): boolean => {
    const activeElement = document.activeElement
    if (!activeElement) return false

    return (
      activeElement.closest('[data-testid="chat-abort-button-top"]') !== null ||
      activeElement.closest('[data-testid="chat-abort-button-bottom"]') !== null
    )
  }

  const handleSendMessage = async (messageContent: string): Promise<void> => {
    if (!messageContent.trim() || isChatStreaming.value) return

    if (currentConversationId.value === 0) {
      const createResult = await createConversation('New Conversation')
      if (createResult.isErr()) {
        conversationError.value = createResult.error.message
        return
      }
      currentConversationId.value = createResult.value
    }

    const provider = currentModel.value.split(':')[0]
    const selectedModel = currentModel.value.split(':')[1]
    const systemPromptText = getSelectedSystemPromptText(undefined)

    const revisionAtSendStart = contextRevision.value
    const prepared = prepareChatRequest()
    let streamingAssistantId: number | undefined

    currentMessage.value = ''

    const result = await sendConversationMessage(currentConversationId.value, messageContent, {
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

  // --- lifecycle init ---
  const initializeChat = async (): Promise<void> => {
    const initResult = await ResultAsync.fromPromise(
      (async () => {
        isLoadingConversations.value = true
        const convResult = await loadConversations()
        isLoadingConversations.value = false
        if (convResult.isErr()) {
          throw convResult.error
        }

        await loadMessageCounts()
        await resumeInterruptedStreams()

        // select latest conversation if none
        if (!currentConversationId.value && store.conversations.length > 0) {
          const highestId = store.conversations.reduce(
            (max, c) => (c.id > max ? c.id : max),
            store.conversations[0].id
          )
          currentConversationId.value = highestId
        }

        await loadMessagesForCurrentConversation()
        await Promise.all([fetchUsername(), loadPersistedSettings()])
      })(),
      (unknownError) =>
        unknownError instanceof Error
          ? new InitializationError(unknownError.message, unknownError)
          : new InitializationError('Chat initialization failed', unknownError)
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
  }

  // --- watches ---
  let lastPreviewText = ''

  watchDebounced(
    [currentMessage, isInVsCode, isChatStreaming, isLoadingConversations, isLoadingMessages],
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

  watch(currentConversationId, async (newId, oldId) => {
    if (newId !== oldId) {
      await loadMessagesForCurrentConversation()
    }
  })

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
      } else {
        currentConversationId.value = result.value
        await loadMessagesForCurrentConversation()
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

  onMounted(() => {
    void initializeChat()
  })

  return {
    // refs for template
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

    // handlers
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
  }
}
