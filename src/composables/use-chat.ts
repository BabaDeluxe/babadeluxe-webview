import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchDebounced, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ResultAsync } from 'neverthrow'
import type ChatInput from '@/components/ChatInput.vue'
import type ChatMessage from '@/components/ChatMessage.vue'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { useConversationStore } from '@/stores/use-conversation-store'
import { localStorageKeys } from '@/constants'
import {
  LOGGER_KEY,
  KEY_VALUE_STORE_KEY,
  SUPABASE_CLIENT_KEY,
  GIT_MESSAGE_KEY,
} from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { InitializationError } from '@/errors'
import { findPreferredModel } from '@/model-preferences'
import { useChatAlerts } from '@/composables/use-chat-alerts'
import { useChatContextHandler } from '@/composables/use-chat-context-handler'
import { useChatStreaming } from '@/composables/use-chat-streaming'
import { useChatHistory } from '@/composables/use-chat-history'
import { useChatInput } from '@/composables/use-chat-input'
import { useChatUser } from '@/composables/use-chat-user'
import { useChatPersistedSettings } from '@/composables/use-chat-persisted-settings'
import { useChatActions } from '@/composables/use-chat-actions'
import { useChatAtSources } from '@/composables/use-chat-at-sources'
import {
  useChatGitMessageWatcher,
  useChatContextUsageWarning,
} from '@/composables/use-chat-helpers'

type ChatMessageInstance = InstanceType<typeof ChatMessage>
type ChatInputInstance = InstanceType<typeof ChatInput>

type ModelItem = {
  value: string
  contextWindow?: number
}

export function useChat() {
  const logger = safeInject(LOGGER_KEY)
  const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)
  const gitMessage = safeInject(GIT_MESSAGE_KEY)

  const route = useRoute()
  const router = useRouter()

  const store = useConversationStore()
  const {
    error: conversationError,
    selectedModelContextWindow,
    lastContextUsage,
  } = storeToRefs(store)

  const { createConversation, loadConversations, loadMessageCounts, resumeInterruptedStreams } =
    store

  const currentConversationId = useStorage<number>(localStorageKeys.currentConversationId, 0)

  const streaming = useChatStreaming()
  const { isChatStreaming } = streaming

  const { messages, isLoadingMessages, loadMessagesForCurrentConversation } =
    useChatHistory(currentConversationId)

  const chatInput = useChatInput()
  const { currentMessage } = chatInput

  const { currentUsername, currentUserId, fetchUsername } = useChatUser(supabase, logger)
  const isContextRootBarVisible = ref(true)

  const chatInputRef = ref<ChatInputInstance>()
  const messageComponents = ref<Map<number, ChatMessageInstance>>(new Map())

  const contextHandler = useChatContextHandler(
    logger,
    currentConversationId,
    currentUserId,
    messages,
    messageComponents
  )

  const {
    isInVsCode,
    contextItems,
    contextError,
    contextRootPath,
    isLoadingContext,
    refreshSuggestions,
    handleRemoveContextItem,
    handleClearAllContext,
    handleToggleLock,
  } = contextHandler

  const isLoadingConversations = ref(false)

  useChatGitMessageWatcher(gitMessage, currentMessage)

  const {
    prompts,
    isLoading: isLoadingPrompts,
    error: promptsError,
    clearError: clearPromptsError,
  } = usePromptsSocket()

  const { persistenceWarning } = useChatAlerts(
    conversationError,
    contextError,
    promptsError,
    clearPromptsError
  )

  const { currentPrompt, currentModel, loadPersistedSettings, persistPrompt, persistModel } =
    useChatPersistedSettings(
      keyValueStore,
      logger,
      currentConversationId,
      currentUserId,
      persistenceWarning
    )

  const contextUsageWarning = useChatContextUsageWarning(lastContextUsage)

  const { groupedModels, isLoadingModels, modelsLoadedCount } = useModelsSocket()
  const { shouldShowModal, dismissModal } = useSubscriptionSocket()

  const { atSources, promptOptions } = useChatAtSources(prompts, isLoadingPrompts, promptsError)

  const activeSources = computed(() => chatInputRef.value?.activeSources ?? [])

  const getSelectedSystemPromptText = (fallback: string | undefined): string | undefined => {
    const selectedPromptObject = prompts.value.find(
      (prompt) => prompt.command === currentPrompt.value
    )
    return selectedPromptObject?.template || fallback
  }

  const registerMessageComponent = (id: number, element: ChatMessageInstance | null) => {
    if (!element) {
      messageComponents.value.delete(id)
      return
    }
    messageComponents.value.set(id, element)
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

  const { handleSendMessage, handleEditMessage, handleRewriteMessage, handleAbortMessage } =
    useChatActions(
      logger,
      store,
      streaming,
      contextHandler,
      chatInput,
      currentConversationId,
      currentUserId,
      messages,
      messageComponents,
      chatInputRef,
      getSelectedSystemPromptText,
      ensureConversation,
      ensureModel,
      conversationError
    )

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

        if (!currentConversationId.value && store.conversations.length > 0) {
          const latest = [...store.conversations].sort((a, b) => {
            const timeA = a.updatedAt?.getTime() ?? 0
            const timeB = b.updatedAt?.getTime() ?? 0
            return timeB - timeA
          })[0]
          currentConversationId.value = latest.id
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

  let lastPreviewText = ''

  watchDebounced(
    [currentMessage, isInVsCode, isChatStreaming, isLoadingConversations, isLoadingMessages],
    async ([text, inVsCode, streamingValue, loadingConversation, loadingMessage]) => {
      const isBusyOrExternal = !inVsCode || streamingValue || loadingConversation || loadingMessage
      if (isBusyOrExternal) return

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

  watch(currentConversationId, async (newConversationId, previousConversationId) => {
    const isNewConversationId = newConversationId !== previousConversationId
    if (isNewConversationId) {
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
        if (modelGroup.items.length === 0) continue
        const preferredModel = findPreferredModel(modelGroup.items)
        if (preferredModel) {
          currentModel.value = preferredModel.value
          return
        }
      }
    },
    { deep: true }
  )

  watchDebounced(currentPrompt, (newValue) => persistPrompt(newValue), { debounce: 300 })

  watchDebounced(currentModel, (newValue) => persistModel(newValue), { debounce: 300 })

  const findModelContextWindow = (fullValue: string): number | undefined => {
    if (!fullValue || !fullValue.includes(':')) return undefined

    const allItems: ModelItem[] = groupedModels.value.flatMap((group) => group.items)
    const match = allItems.find((item) => item.value === fullValue)
    return match?.contextWindow
  }

  const activeModelContextWindow = computed(() => {
    const trimmedModelValue = currentModel.value?.trim()
    if (!trimmedModelValue) return undefined

    return findModelContextWindow(trimmedModelValue)
  })

  watch(
    activeModelContextWindow,
    (newContextWindow) => {
      selectedModelContextWindow.value = newContextWindow
    },
    { immediate: true }
  )

  onMounted(() => void initializeChat())

  return {
    chatInputRef,
    messages,
    isLoadingConversations,
    isLoadingMessages,
    isChatStreaming,
    isInVsCode,
    contextItems,
    contextError,
    contextRootPath,
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
    atSources,
    activeSources,
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
