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
  const route = useRoute()
  const router = useRouter()
  const store = useConversationStore()
  const {
    currentConversationId,
    messages,
    isLoadingConversations,
    isLoadingMessages,
  } = storeToRefs(store)

  const {
    loadConversations,
    createConversation,
    loadMessages,
    deleteConversation,
    updateConversationTitle,
  } = store

  const logger = safeInject(LOGGER_KEY)
  const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)
  const supabase = safeInject(SUPABASE_CLIENT_KEY)

  const chatInputRef = ref<InstanceType<typeof ChatInput>>()
  const currentMessage = ref('')
  const currentPrompt = ref<string>()
  const currentModel = ref<string>(defaultModel)
  const currentUserId = ref<string>()
  const currentUsername = ref('User')

  const { isChatStreaming, sendChatMessage, abortChatMessage, resumeInterruptedStreams } =
    useChatSocket()
  const { groupedModels, isLoadingModels, modelsLoadedCount, reloadModels } = useModelsSocket()
  const { promptOptions } = usePromptsSocket()
  const { shouldShowModal, dismissModal } = useSubscriptionSocket()

  const {
    contextItems,
    isLoadingContext,
    contextError,
    contextRevision,
    isContextRootBarVisible,
    lastContextUsage,
    contextUsageWarning,
    refreshSuggestions,
    clearAllContext,
    handleRemoveContextItem,
    handleClearAllContext,
    handleToggleLock,
    getLockedReferences,
    resolveFilesFromDocument,
  } = useChatContextHandler()

  const { conversationError, persistenceWarning } = useChatAlerts()

  const selectedModelContextWindow = ref<number>()

  const registerMessageComponent = (id: number, component: InstanceType<typeof ChatMessage>) => {
    // handled via refs if needed, but logic is inside store/socket
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
        logger.error('Failed to fetch username', { error })
      }
    )
  }

  const loadPersistedSettings = async () => {
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

  const loadMessagesForCurrentConversation = async () => {
    if (!currentConversationId.value) return
    const result = await loadMessages(currentConversationId.value)
    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const loadMessageCounts = async () => {
    await store.loadMessageCounts()
  }

  const handleDeleteMessage = async (id: number) => {
    const result = await store.deleteMessage(id)
    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const handleEditMessage = async (id: number, newContent: string) => {
    const result = await store.updateMessage(id, newContent)
    if (result.isErr()) {
      conversationError.value = result.error.message
    }
  }

  const handleRewriteMessage = async (id: number) => {
    // Logic for rewriting (delete + resend)
  }

  const handleSendMessage = async (messageContent: string) => {
    if (!messageContent.trim() || isChatStreaming.value) return

    const provider = currentModel.value.split(':')[0]
    const selectedModel = currentModel.value.split(':')[1]
    const systemPromptText = currentPrompt.value

    const revisionAtSendStart = contextRevision.value
    const prepared = {
      contextReferences: getLockedReferences(),
      contextItems: contextItems.value,
      onChunk: (chunk: string) => {
        // handled via socket/store
      },
    }

    const result = await sendChatMessage(currentConversationId.value, messageContent, {
      provider,
      model: selectedModel,
      systemPrompt: systemPromptText,
      contextReferences: prepared.contextReferences,
      contextItems: prepared.contextItems,
      onChunk: prepared.onChunk,
      onComplete: async (messageId: number) => {
        // handled via socket/store
      },
      onError: async (errorResult: unknown) => {
        // handled via socket/store
      },
    })

    if (result.isErr()) {
      conversationError.value = result.error.message
    } else {
      currentMessage.value = ''
      clearAllContext()
    }
  }

  const handleAbortMessage = async () => {
    await abortChatMessage(0) // Logic depends on active streaming ID
  }

  const handleModalClose = () => {
    dismissModal()
  }

  const handleToggleRootBar = () => {
    isContextRootBarVisible.value = !isContextRootBarVisible.value
  }

  const initializeChat = async () => {
    isLoadingConversations.value = true
    await loadConversations()
    isLoadingConversations.value = false

    if (!currentConversationId.value && store.conversations.length > 0) {
      currentConversationId.value = store.conversations[0].id
    }

    await Promise.all([
      loadMessagesForCurrentConversation(),
      fetchUsername(),
      loadPersistedSettings(),
    ])
  }

  onMounted(() => {
    void initializeChat()
  })

  return {
    chatInputRef,
    messages,
    isLoadingConversations,
    isLoadingMessages,
    isChatStreaming,
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
  }
}
