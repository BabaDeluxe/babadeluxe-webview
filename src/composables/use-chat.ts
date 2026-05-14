import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ResultAsync } from 'neverthrow'
import type ChatInput from '@/components/ChatInput.vue'
import type ChatMessage from '@/components/ChatMessage.vue'
import { useModelsSocket } from '@/composables/use-models-socket'
import { usePromptsSocket } from '@/composables/use-prompts-socket'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { useConversationStore } from '@/stores/use-conversation-store'
import { localStorageKeys } from '@/constants'
import { LOGGER_KEY, KEY_VALUE_STORE_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import { AuthError } from '@/errors'
import { useChatAlerts } from '@/composables/use-chat-alerts'
import { useChatContextHandler } from '@/composables/use-chat-context-handler'
import { useChatStreaming } from '@/composables/use-chat-streaming'
import { useChatHistory } from '@/composables/use-chat-history'
import { useChatInput } from '@/composables/use-chat-input'
import { isOfflineMode } from '@/env-validator'

type ChatMessageInstance = InstanceType<typeof ChatMessage>
type ChatInputInstance = InstanceType<typeof ChatInput>

export function useChat() {
  const logger = safeInject(LOGGER_KEY)
  const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)

  const route = useRoute()
  const router = useRouter()

  const store = useConversationStore()
  const {
    error: conversationError,
    lastContextUsage,
  } = storeToRefs(store)

  const {
    sendMessage: sendConversationMessage,
    resendFromMessage,
    rewriteWithModel,
    loadConversations,
    loadMessageCounts,
    resumeInterruptedStreams,
  } = store

  const currentConversationId = ref(0)

  const { isChatStreaming, currentStreamingMessageId, abortChatMessage } = useChatStreaming()
  const { messages, isLoadingMessages, loadMessagesForCurrentConversation } =
    useChatHistory(currentConversationId)
  const { currentMessage, currentPrompt, currentModel, clearMessage } = useChatInput()

  const currentUsername = ref('User')
  const currentUserId = ref<string>()
  const isContextRootBarVisible = ref(true)

  const chatInputRef = ref<ChatInputInstance>()
  const messageComponents = ref<Map<number, ChatMessageInstance>>(new Map())

  const {
    isInVsCode,
    contextItems,
    contextError,
    contextRevision,
    isLoadingContext,
    contextRootPath,
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

  const { groupedModels, isLoadingModels, modelsLoadedCount } = useModelsSocket()
  const { shouldShowModal, dismissModal } = useSubscriptionSocket()

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

  const shouldRestoreFocusAfterAbort = (): boolean => {
    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement)) return false

    return (
      activeElement.closest('[data-testid="chat-abort-button-top"]') !== null ||
      activeElement.closest('[data-testid="chat-abort-button-bottom"]') !== null
    )
  }

  const fetchUsername = async (): Promise<void> => {
    if (isOfflineMode()) {
      currentUserId.value = 'offline-user'
      currentUsername.value = 'Local User'
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
    const result = await keyValueStore.get(localStorageKeys.lastSelectedModel)
    if (result.isOk() && result.value) {
      currentModel.value = result.value
    }
  }

  const handleSendMessage = async () => {
    if (isChatStreaming.value || !currentMessage.value.trim()) return

    const conversationId = currentConversationId.value
    const messageText = currentMessage.value
    clearMessage()

    const { contextReferences, contextItems, onChunk } = await prepareChatRequest()

    const [provider, model] = currentModel.value.split(':')

    const result = await sendConversationMessage(conversationId, messageText, {
      provider: provider || 'openai',
      model: model || 'gpt-4o',
      systemPrompt: getSelectedSystemPromptText(undefined),
      contextReferences,
      contextItems,
      onChunk: (messageId, chunk) => onChunk(messageId),
      onError: (err) => {
        logger.error('Failed to send message', { error: err })
        currentMessage.value = messageText
      },
    })

    if (result.isOk()) {
      if (conversationId === 0) {
        currentConversationId.value = result.value
      }
    }
  }

  const handleAbortMessage = async () => {
    const shouldRestore = shouldRestoreFocusAfterAbort()
    const messageId = currentStreamingMessageId.value
    if (messageId !== undefined) {
      await abortChatMessage(messageId)
    }
    if (shouldRestore) {
      nextTick(() => chatInputRef.value?.focus())
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    await store.deleteMessage(messageId)
  }

  const handleEditMessage = async (messageId: number, _newContent: string) => {
    const { contextReferences, contextItems, onChunk } = await prepareChatRequest()

    const [provider, model] = currentModel.value.split(':')

    await resendFromMessage(currentConversationId.value, messageId, {
      provider: provider || 'openai',
      model: model || 'gpt-4o',
      systemPrompt: getSelectedSystemPromptText(undefined),
      contextReferences,
      contextItems,
      onChunk: (msgId, chunk) => onChunk(msgId),
    })
  }

  const handleRewriteMessage = async (messageId: number, modelId: string) => {
    const { contextReferences, contextItems, onChunk } = await prepareChatRequest()

    await rewriteWithModel(currentConversationId.value, messageId, modelId, {
      systemPrompt: getSelectedSystemPromptText(undefined),
      contextReferences,
      contextItems,
      onChunk: (msgId, chunk) => onChunk(msgId),
    })
  }

  const handleModalClose = () => {
    dismissModal()
  }

  const handleToggleRootBar = () => {
    isContextRootBarVisible.value = !isContextRootBarVisible.value
  }

  watchDebounced(
    currentMessage,
    (val) => {
      if (val.trim()) {
        refreshSuggestions(val)
      }
    },
    { debounce: 300 }
  )

  watch(currentModel, (val) => {
    void keyValueStore.set(localStorageKeys.lastSelectedModel, val)
  })

  onMounted(async () => {
    isLoadingConversations.value = true
    await Promise.all([
      fetchUsername(),
      loadPersistedSettings(),
      loadConversations(),
      loadMessageCounts(),
      loadMessagesForCurrentConversation(),
      resumeInterruptedStreams(),
    ])
    isLoadingConversations.value = false
  })

  return {
    chatInputRef,
    messages,
    isLoadingConversations,
    isLoadingMessages,
    isChatStreaming,
    isInVsCode,
    contextItems,
    contextError,
    isLoadingContext,
    contextRootPath,
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
    persistenceWarning
  }
}
