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
import {
  useVsCodeContextStore,
  type LockedContextReference,
} from '@/stores/use-vs-code-context-store'
import { useConversationStore } from '@/stores/use-conversation-store'
import { defaultModel, localStorageKeys, streamingCommitIntervalMs } from '@/constants'
import type { ContextReference } from '@/database/types'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY, APP_DB_KEY } from '@/injection-keys'
import { createStreamingCommitHandler, finalizeStreamingMessage } from '@/streaming-helpers'
import { safeInject } from '@/safe-inject'
import { AuthError, InitializationError } from '@/errors'
import { findPreferredModel } from '@/model-preferences'
import { isVsCodeContextItem } from '@/vs-code/context-type-guards'

type ChatMessageInstance = InstanceType<typeof ChatMessage>
type ChatInputInstance = InstanceType<typeof ChatInput>
type FormattedContextItem = { kind: 'file' | 'snippet'; filePath: string; content: string }

type BaseAlertBanner = {
  id: string
  message: string | undefined
  type: 'error' | 'warning'
  isDismissible: boolean
  onClose: () => void
}

type PreparedChatRequest = {
  contextReferences: ContextReference[]
  contextItems: FormattedContextItem[]
  onChunk: ReturnType<typeof createStreamingCommitHandler>
}

type ModelItem = {
  value: string
  contextWindow?: number
}

export function useChat() {
  const logger = safeInject(LOGGER_KEY)
  const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)
  const appDb = safeInject(APP_DB_KEY)

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
    loadMessageCounts,
    resumeInterruptedStreams,
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

  const { groupedModels, isLoadingModels, modelsLoadedCount } = useModelsSocket()

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

  const chatInputRef = ref<ChatInputInstance>()
  const messageComponents = ref<Map<number, ChatMessageInstance>>(new Map())

  const currentConversationId = useStorage<number>(localStorageKeys.currentConversationId, 0)

  const isLoadingConversations = ref(false)
  const isLoadingMessages = ref(false)

  const modelsReloadWarning = ref<string>()
  const persistenceWarning = ref<string>()

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

  // --- alerts setup (same as before) ---
  const baseAlerts = ref<BaseAlertBanner[]>([
    {
      id: 'conversation-error',
      message: undefined,
      type: 'error',
      isDismissible: true,
      onClose: () => (conversationError.value = undefined),
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
      onClose: () => (contextError.value = undefined),
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
      onClose: () => (modelsReloadWarning.value = undefined),
    },
    {
      id: 'persistence-warning',
      message: undefined,
      type: 'warning',
      isDismissible: true,
      onClose: () => (persistenceWarning.value = undefined),
    },
  ])

  const setBaseAlertMessage = (id: string, message: string | undefined) => {
    const banner = baseAlerts.value.find((alert) => alert.id === id)
    if (!banner) return
    banner.message = message
  }

  watch(
    conversationError,
    (v) => {
      setBaseAlertMessage('conversation-error', v)
    },
    {
      immediate: true,
    }
  )
  watch(
    chatError,
    (v) => {
      setBaseAlertMessage('chat-error', v)
    },
    { immediate: true }
  )
  watch(
    contextError,
    (v) => {
      setBaseAlertMessage('context-error', v)
    },
    { immediate: true }
  )
  watch(
    promptsError,
    (v) => {
      setBaseAlertMessage('prompts-error', v)
    },
    { immediate: true }
  )
  watch(
    modelsReloadWarning,
    (v) => {
      setBaseAlertMessage('models-reload-warning', v)
    },
    {
      immediate: true,
    }
  )
  watch(
    persistenceWarning,
    (v) => {
      setBaseAlertMessage('persistence-warning', v)
    },
    {
      immediate: true,
    }
  )

  const activeBaseAlerts = computed(() =>
    baseAlerts.value.filter((banner) => banner.message !== undefined)
  )

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

  const registerMessageComponent = (id: number, element: Element | ChatMessageInstance | null) => {
    if (!element) {
      messageComponents.value.delete(id)
      return
    }
    if ('$' in (element as Element | ChatMessageInstance)) {
      messageComponents.value.set(id, element as ChatMessageInstance)
    }
  }

  function toContextReference(refLocked: LockedContextReference): ContextReference | undefined {
    if (refLocked.kind === 'file') {
      const cleaned = refLocked.filePath.trim()
      if (!cleaned) return undefined
      return { type: 'file', filePath: cleaned }
    }

    const cleanedSnippet = refLocked.snippetText.trim()
    if (!cleanedSnippet) return undefined

    const cleanedPath = refLocked.filePath.trim()
    return cleanedPath.length > 0
      ? { type: 'snippet', filePath: cleanedPath, snippetText: cleanedSnippet }
      : { type: 'snippet', snippetText: cleanedSnippet }
  }

  const prepareChatRequest = async (): Promise<PreparedChatRequest> => {
    const locked = getLockedReferences()

    const lockedFilePaths = locked
      .filter((refLocked) => refLocked.kind === 'file')
      .map((refLocked) => refLocked.filePath)

    const lockedSnippets = locked
      .filter((refLocked) => refLocked.kind === 'snippet')
      .map((refLocked) => ({
        filePath: refLocked.filePath,
        snippetText: refLocked.snippetText,
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

  const fetchUsername = async (): Promise<void> => {
    const getUserResult = await ResultAsync.fromPromise(supabase.auth.getUser(), (unknownError) =>
      unknownError instanceof Error
        ? new AuthError(unknownError.message, unknownError)
        : new AuthError('Failed to fetch user', unknownError)
    )

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

  // --- message loading using AppDb directly ---
  async function loadMessagesForCurrentConversation(): Promise<void> {
    if (!currentConversationId.value) {
      messages.value = []
      return
    }

    isLoadingMessages.value = true
    const result = await appDb.getMessageByConversation(currentConversationId.value)
    isLoadingMessages.value = false

    if (result.isErr()) {
      logger.error('Failed to load messages in chat view', {
        conversationId: currentConversationId.value,
        userId: currentUserId.value,
        error: result.error,
      })
      messages.value = []
      conversationError.value = 'Failed to load messages'
      return
    }

    messages.value = [...result.value]
    conversationError.value = undefined
  }

  const handleDeleteMessage = async (messageId: number) => {
    const result = await store.deleteMessage(messageId)

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

  const createError = (fallback: string, errorResult: unknown): Error =>
    errorResult instanceof Error
      ? errorResult
      : new Error(typeof errorResult === 'string' ? errorResult : fallback)

  async function handleEditMessage(messageId: number, newContent: string) {
    const updateResult = await store.updateUserMessage(messageId, newContent)
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

    const { provider, model } = fromCurrent

    const systemPromptText = getSelectedSystemPromptText(nextMessage.systemPrompt)
    const prepared = await prepareChatRequest()

    await resendFromMessage(currentConversationId.value, messageId, {
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

    await rewriteWithModel(currentConversationId.value, assistantMessageId, newModelId, {
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
    currentConversationId.value = result.value
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

  let streamingAssistantId: number | undefined

  const cleanupStreamingMessage = async () => {
    if (streamingAssistantId == null) return

    const msg = messages.value.find((m) => m.id === streamingAssistantId)
    if (msg) msg.isStreaming = false

    const deleteResult = await store.deleteMessage(streamingAssistantId)
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
      isLoadingMessages.value
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
    activeBaseAlerts,
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
