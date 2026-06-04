import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type Result, err, ok } from 'neverthrow'
import type { Message, ContextReference } from '@/database/types'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'
import { useChatSocket } from '@/composables/use-chat-socket'
import type { DbError } from '@/errors'
import {
  MessageNotFoundError,
  InvalidModelFormatError,
  MessageCreationError,
  ChatError,
  type CreateOrResetAssistantError,
  MessageUpdateError,
  type ValidationError,
} from '@/errors'
import { safeInject } from '@/safe-inject'
import { useFileContextResolver } from '@/composables/use-file-context-resolver'
import { encodeContextReferences } from '@/database/serializers'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { ChatContextManager } from '@/services/chat-context-manager'
import { useConversationListState } from '@/stores/conversation/use-conversation-list-state'
import { useMessageManagement } from '@/stores/conversation/use-message-management'

type SendOptions = {
  provider: string
  model: string
  systemPrompt: string | undefined
  contextReferences?: ContextReference[]
  contextItems?: Array<{ filePath: string; content: string }>
  existingAssistantId?: number
  onChunk?: (messageId: number, chunk: string) => void
  onComplete?: (messageId: number) => void
  onError?: (error: Error) => void
}

type MessageMetadata = {
  model?: string
  systemPrompt?: string
}

export const useConversationStore = defineStore('conversation', () => {
  const logger = safeInject(LOGGER_KEY)
  const appDb = safeInject(APP_DB_KEY)

  const { sendMessage: sendChatSocket, resumeStreamingMessage } = useChatSocket()
  const { resolveFromReferences } = useFileContextResolver()
  const { createTimeout } = useTrackedTimeouts()

  const messages = ref<Message[]>([])
  const {
    conversations,
    isLoadingConversations,
    messageCountsByConversation,
    error,
    loadConversations,
    loadMessageCounts,
    getMessageCount,
    createConversation: _createConversation,
    updateConversationTitle,
    deleteConversation,
  } = useConversationListState(appDb)

  async function createConversation(title: string): Promise<Result<number, DbError | ChatError>> {
    const result = await _createConversation(title)
    if (result.isOk()) {
      messages.value = []
    }
    return result
  }

  const {
    loadMessages,
    refreshMessageById,
    deleteMessage,
    createUserMessage,
    updateUserMessage,
    finalizeAssistantMessage,
  } = useMessageManagement(appDb, messages, messageCountsByConversation)

  const lastContextUsage = ref(0)
  const selectedModelContextWindow = ref<number | undefined>(undefined)

  let initializePromise: Promise<Result<void, DbError>> | undefined

  async function initialize(): Promise<Result<void, DbError>> {
    if (initializePromise) return initializePromise

    initializePromise = (async () => {
      try {
        const loadConversationsResult = await loadConversations()
        if (loadConversationsResult.isErr()) {
          logger.error('Failed to load conversations during initialization', {
            error: loadConversationsResult.error,
          })
          return err(loadConversationsResult.error)
        }

        const loadMessageCountsResult = await loadMessageCounts()
        if (loadMessageCountsResult.isErr()) {
          logger.error('Failed to load message counts during initialization', {
            error: loadMessageCountsResult.error,
          })
          return err(loadMessageCountsResult.error)
        }

        await resumeInterruptedStreams()
        return ok(undefined)
      } finally {
        initializePromise = undefined
      }
    })()

    return initializePromise
  }

  async function markMessageStreamingComplete(messageId: number): Promise<void> {
    const updateResult = await appDb.message.update(messageId, { isStreaming: false })
    if (updateResult.isErr()) {
      logger.error('Failed to mark message streaming complete', {
        messageId,
        error: updateResult.error,
      })
      return
    }

    const refreshResult = await refreshMessageById(messageId)
    if (refreshResult.isErr()) {
      logger.error('Failed to refresh message after streaming complete', {
        messageId,
        error: refreshResult.error,
      })
    }
  }

  async function markAllStreamingCompleteInCurrentConversation(
    conversationId: number
  ): Promise<void> {
    if (!conversationId) return

    const streamingMessages = messages.value.filter(
      (message) => message.conversationId === conversationId && message.isStreaming
    )

    for (const message of streamingMessages) {
      const updateResult = await appDb.message.update(message.id, { isStreaming: false })
      if (updateResult.isErr()) {
        logger.error('Failed to mark message streaming complete when switching conversation', {
          messageId: message.id,
          error: updateResult.error,
        })
        continue
      }

      const index = messages.value.findIndex((m) => m.id === message.id)
      if (index === -1) continue

      const current = messages.value[index]
      current.isStreaming = false
    }
  }

  async function resumeInterruptedStreams(): Promise<void> {
    const streamingMessagesResult = await appDb.chatRepository.getStreamingMessages()

    if (streamingMessagesResult.isErr()) {
      logger.error('Failed to get streaming messages during recovery', {
        error: streamingMessagesResult.error,
      })
      return
    }

    const streamingMessages = streamingMessagesResult.value
    if (streamingMessages.length === 0) {
      logger.log('No interrupted streams to recover')
      return
    }

    logger.log(`Recovering ${streamingMessages.length} interrupted stream(s)`)

    for (const streamingMessage of streamingMessages) {
      let didReceiveChunk = false

      resumeStreamingMessage(streamingMessage.id, {
        onChunk: (chunk: string) => {
          didReceiveChunk = true

          const messageIndex = messages.value.findIndex(
            (message) => message.id === streamingMessage.id
          )
          if (messageIndex === -1) return

          const current = messages.value[messageIndex]
          const updated: Message = {
            ...current,
            content: current.content + chunk,
          }

          messages.value.splice(messageIndex, 1, updated)
        },
        onComplete: (fullContent: string) => {
          didReceiveChunk = true

          const messageIndex = messages.value.findIndex(
            (message) => message.id === streamingMessage.id
          )
          if (messageIndex === -1) return

          const current = messages.value[messageIndex]
          const updated: Message = {
            ...current,
            content: fullContent,
            isStreaming: false,
          }

          messages.value.splice(messageIndex, 1, updated)
          void markMessageStreamingComplete(streamingMessage.id)
        },
      })

      createTimeout(async () => {
        if (didReceiveChunk) return

        logger.log('Message appears complete, cleaning up', {
          messageId: streamingMessage.id,
        })

        await markMessageStreamingComplete(streamingMessage.id)
      }, 1000)
    }

    logger.log('Stream recovery complete')
  }

  async function resetExistingAssistantStreamingMessage(
    assistantMessageId: number,
    metadata: MessageMetadata | undefined,
    contextReferences: ContextReference[] | undefined
  ): Promise<Result<Message, MessageNotFoundError | MessageUpdateError>> {
    const updateResult = await appDb.message.update(assistantMessageId, {
      content: '',
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences: encodeContextReferences(contextReferences),
    })

    if (updateResult.isErr()) {
      return err(new MessageUpdateError(assistantMessageId, updateResult.error))
    }

    const messageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    if (messageIndex === -1) {
      return err(new MessageNotFoundError(assistantMessageId.toString()))
    }

    const oldMessage = messages.value[messageIndex]
    const updated: Message = {
      ...oldMessage,
      content: '',
      isStreaming: true,
      model: metadata?.model ?? oldMessage.model,
      systemPrompt: metadata?.systemPrompt ?? oldMessage.systemPrompt,
      contextReferences,
      timestamp: oldMessage.timestamp,
    }

    messages.value.splice(messageIndex, 1, updated)
    return ok(updated)
  }

  async function createNewAssistantStreamingMessage(
    conversationId: number,
    metadata: MessageMetadata | undefined,
    contextReferences: ContextReference[] | undefined
  ): Promise<Result<Message, MessageCreationError>> {
    const createResult = await appDb.chatRepository.createMessage({
      conversationId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences,
    })

    if (createResult.isErr()) {
      return err(new MessageCreationError('assistant', createResult.error))
    }

    const newMessage: Message = {
      id: createResult.value,
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences,
    }

    messages.value.push(newMessage)
    return ok(newMessage)
  }

  async function createOrResetAssistantStreamingMessage(
    conversationId: number,
    existingAssistantId: number | undefined,
    metadata: MessageMetadata | undefined,
    contextReferences: ContextReference[] | undefined
  ): Promise<Result<Message, CreateOrResetAssistantError>> {
    if (existingAssistantId !== undefined) {
      return resetExistingAssistantStreamingMessage(
        existingAssistantId,
        metadata,
        contextReferences
      )
    }

    return createNewAssistantStreamingMessage(conversationId, metadata, contextReferences)
  }

  function generateConversationTitle(firstMessage: string): string {
    const trimmed = firstMessage.trim()
    const title = trimmed.slice(0, 50)
    return title.length < trimmed.length ? `${title}...` : title
  }

  async function sendWithHistory(
    conversationId: number,
    historyMessages: Message[],
    options: SendOptions
  ): Promise<
    Result<number, ChatError | DbError | MessageCreationError | CreateOrResetAssistantError>
  > {
    const {
      provider,
      model,
      systemPrompt,
      contextItems,
      contextReferences,
      existingAssistantId,
      onChunk,
      onComplete,
      onError,
    } = options

    const assistantResult = await createOrResetAssistantStreamingMessage(
      conversationId,
      existingAssistantId,
      {
        model: `${provider}:${model}`,
        systemPrompt,
      },
      contextReferences
    )

    if (assistantResult.isErr()) return err(assistantResult.error)

    const messageId = assistantResult.value.id

    if (selectedModelContextWindow.value !== undefined) {
      lastContextUsage.value = ChatContextManager.computeContextUsage(
        historyMessages,
        systemPrompt,
        contextItems,
        selectedModelContextWindow.value
      )
    } else {
      lastContextUsage.value = 0
    }

    const messagesToSend: Array<{ role: Message['role']; content: string }> = []
    for (const message of historyMessages) {
      messagesToSend.push({
        role: message.role,
        content: message.content,
      })
    }

    const injected = ChatContextManager.buildInjectedText(systemPrompt, contextItems ?? [])
    const last = messagesToSend[messagesToSend.length - 1]

    if (last?.role === 'user' && injected) {
      messagesToSend[messagesToSend.length - 1] = {
        role: 'user',
        content: `${injected}\n\n${last.content}`,
      }
    }

    let fullContentFromServer: string | undefined

    const streamResult = await sendChatSocket(messageId, provider, model, messagesToSend, {
      onChunk: (chunk: string) => {
        const messageIndex = messages.value.findIndex((message) => message.id === messageId)
        if (messageIndex === -1) return

        const current = messages.value[messageIndex]
        const updated: Message = {
          ...current,
          content: current.content + chunk,
        }

        messages.value.splice(messageIndex, 1, updated)
        onChunk?.(messageId, chunk)
      },
      onComplete: (fullContent: string) => {
        fullContentFromServer = fullContent

        const messageIndex = messages.value.findIndex((message) => message.id === messageId)
        if (messageIndex === -1) return

        const current = messages.value[messageIndex]
        const updated: Message = {
          ...current,
          content: fullContent,
        }

        messages.value.splice(messageIndex, 1, updated)
      },
      onError: (errorMessage: string) => {
        onError?.(new ChatError(errorMessage))
      },
    })

    if (streamResult.isErr()) {
      onError?.(streamResult.error)

      if (existingAssistantId === undefined) {
        const deleteResult = await deleteMessage(messageId)
        if (deleteResult.isErr()) {
          logger.error('Failed to delete assistant message after stream error', {
            messageId,
            error: deleteResult.error,
          })
        }

        return err(streamResult.error)
      }

      await markMessageStreamingComplete(messageId)
      return err(streamResult.error)
    }

    if (fullContentFromServer === undefined) {
      logger.warn('sendChatSocket resolved ok but onComplete was never called', {
        messageId,
      })

      const currentContent =
        messages.value.find((message) => message.id === messageId)?.content ?? ''

      const finalizeResult = await finalizeAssistantMessage(messageId, currentContent)
      if (finalizeResult.isErr()) return err(finalizeResult.error)

      onComplete?.(messageId)
      return ok(messageId)
    }

    const finalizeResult = await finalizeAssistantMessage(messageId, fullContentFromServer)
    if (finalizeResult.isErr()) return err(finalizeResult.error)

    onComplete?.(messageId)
    return ok(messageId)
  }

  async function sendMessage(
    conversationId: number,
    newUserMessage: string,
    options: SendOptions
  ): Promise<
    Result<number, ChatError | DbError | MessageCreationError | CreateOrResetAssistantError>
  > {
    const userResult = await createUserMessage(
      conversationId,
      newUserMessage,
      undefined,
      options.contextReferences
    )

    if (userResult.isErr()) {
      return err(new MessageCreationError('user', userResult.error))
    }

    const historyMessages = messages.value.filter((message) => message.id !== 0)

    return sendWithHistory(conversationId, historyMessages, options)
  }

  async function resendFromMessage(
    conversationId: number,
    messageId: number,
    options: SendOptions
  ): Promise<
    Result<
      number,
      | MessageNotFoundError
      | ChatError
      | DbError
      | MessageCreationError
      | CreateOrResetAssistantError
      | ValidationError
    >
  > {
    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex === -1) {
      return err(new MessageNotFoundError(messageId.toString()))
    }

    const userMessage = messages.value[messageIndex]

    let freshContextItems: Array<{ filePath: string; content: string }> | undefined
    if (userMessage.contextReferences && userMessage.contextReferences.length > 0) {
      const resolveResult = await resolveFromReferences(userMessage.contextReferences)
      if (resolveResult.isErr()) {
        logger.error('Failed to resolve context on resend', {
          messageId,
          error: resolveResult.error,
        })

        return err(resolveResult.error)
      }

      freshContextItems = resolveResult.value
    }

    const historyMessages = messages.value.slice(0, messageIndex + 1)

    const result = await sendWithHistory(conversationId, historyMessages, {
      ...options,
      contextItems: freshContextItems,
      contextReferences: userMessage.contextReferences,
    })

    const assistantMessageIdToRefresh =
      options.existingAssistantId ?? (result.isOk() ? result.value : undefined)

    if (assistantMessageIdToRefresh !== undefined) {
      const refreshResult = await refreshMessageById(assistantMessageIdToRefresh)
      if (refreshResult.isErr()) {
        logger.error('Failed to refresh message after resend', {
          messageId: assistantMessageIdToRefresh,
          error: refreshResult.error,
        })
      }
    }

    return result
  }

  async function rewriteWithModel(
    conversationId: number,
    assistantMessageId: number,
    newModelId: string,
    options: Omit<SendOptions, 'provider' | 'model'>
  ): Promise<
    Result<
      number,
      | MessageNotFoundError
      | InvalidModelFormatError
      | ChatError
      | DbError
      | MessageCreationError
      | CreateOrResetAssistantError
    >
  > {
    const assistantMessageIndex = messages.value.findIndex(
      (message) => message.id === assistantMessageId
    )
    if (assistantMessageIndex === -1) {
      return err(new MessageNotFoundError(assistantMessageId.toString()))
    }

    const historyMessages = messages.value.slice(0, assistantMessageIndex)

    if (!newModelId.includes(':')) {
      return err(new InvalidModelFormatError(newModelId))
    }

    const [provider, model] = newModelId.split(':')
    if (!provider || !model) {
      return err(new InvalidModelFormatError(newModelId))
    }

    const result = await sendWithHistory(conversationId, historyMessages, {
      ...options,
      provider,
      model,
      existingAssistantId: assistantMessageId,
    })

    const refreshResult = await refreshMessageById(assistantMessageId)
    if (refreshResult.isErr()) {
      logger.error('Failed to refresh assistant message after rewrite', {
        messageId: assistantMessageId,
        error: refreshResult.error,
      })
    }

    return result
  }

  return {
    messages,
    conversations,
    isLoadingConversations,
    error,
    messageCountsByConversation,
    lastContextUsage,
    selectedModelContextWindow,

    initialize,
    refreshMessageById,
    loadConversations,
    loadMessages,
    loadMessageCounts,
    getMessageCount,

    createConversation,
    updateConversationTitle,
    deleteConversation,

    updateUserMessage,
    createUserMessage,
    deleteMessage,

    generateConversationTitle,
    resumeInterruptedStreams,

    sendMessage,
    sendWithHistory,
    resendFromMessage,
    rewriteWithModel,
    finalizeAssistantMessage,

    markAllStreamingCompleteInCurrentConversation,
  }
})
