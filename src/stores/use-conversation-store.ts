import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ResultAsync, type Result, err, ok } from 'neverthrow'
import type { Message, Conversation, ContextReference } from '@/database/types'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'
import { useChatSocket } from '@/composables/use-chat-socket'
import type { ValidationError } from '@/errors'
import {
  MessageNotFoundError,
  InvalidModelFormatError,
  MessageCreationError,
  ChatError,
  DbError,
  type CreateOrResetAssistantError,
  MessageUpdateError,
} from '@/errors'
import { safeInject } from '@/safe-inject'
import { useFileContextResolver } from '@/composables/use-file-context-resolver'
import { encodeContextReferences, decodeContextReferences } from '@/database/serializers'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'

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

type MessageMetadata = { model?: string; systemPrompt?: string }

function buildInjectedText(
  systemPrompt?: string,
  contextItems?: Array<{ filePath: string; content: string }>
): string {
  const parts: string[] = []

  const sp = systemPrompt?.trim()
  if (sp) {
    parts.push(`SYSTEM:\n${sp}`)
  }

  const cleanedItems = (contextItems ?? []).filter(
    (item) => item.filePath?.trim().length && item.content?.trim().length
  )

  if (cleanedItems.length) {
    const ctxParts: string[] = []
    for (const item of cleanedItems) {
      ctxParts.push(`FILE: ${item.filePath}\n${item.content}`)
    }
    const ctx = ctxParts.join('\n\n')
    parts.push(`CONTEXT:\n${ctx}`)
  }

  if (!parts.length) return ''
  return `\n\n---\n${parts.join('\n\n')}\n---\n`
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function computeContextUsageForSend(
  historyMessages: Message[],
  systemPrompt: string | undefined,
  contextItems: Array<{ filePath: string; content: string }> | undefined,
  modelContextWindow: number
): number {
  if (!modelContextWindow || modelContextWindow <= 0) {
    return 0
  }

  const messagesToSend: Array<{ role: Message['role']; content: string }> = []
  for (const message of historyMessages) {
    messagesToSend.push({
      role: message.role,
      content: message.content,
    })
  }

  const injected = buildInjectedText(systemPrompt, contextItems ?? [])
  const last = messagesToSend[messagesToSend.length - 1]
  if (last && last.role === 'user' && injected) {
    last.content = `${last.content}${injected}`
  }

  const safeBudget = Math.max(1, Math.floor(modelContextWindow * 0.95))

  let totalTokens = 0
  for (const msg of messagesToSend) {
    totalTokens += estimateTokens(msg.content)
  }

  const usagePercent = totalTokens / safeBudget
  return usagePercent > 1 ? 1 : usagePercent
}

export const useConversationStore = defineStore('conversation', () => {
  const logger = safeInject(LOGGER_KEY)
  const appDb = safeInject(APP_DB_KEY)

  const { sendMessage: sendChatSocket, resumeStreamingMessage } = useChatSocket()
  const { resolveFromReferences } = useFileContextResolver()
  const { createTimeout } = useTrackedTimeouts()

  const messages = ref<Message[]>([])
  const conversations = ref<Conversation[]>([])
  const isLoadingConversations = ref(false)
  const error = ref<string | undefined>(undefined)
  const messageCountsByConversation = ref<Map<number, number>>(new Map())
  const lastContextUsage = ref(0)
  const selectedModelContextWindow = ref<number | undefined>(undefined)

  let creationPromise: Promise<Result<number, DbError | ChatError>> | undefined
  let initializePromise: Promise<void> | undefined

  async function initialize(): Promise<void> {
    if (initializePromise) return initializePromise

    try {
      initializePromise = (async () => {
        const loadConversationsResult = await loadConversations()
        if (loadConversationsResult.isErr()) {
          logger.error('Failed to load conversations during initialization', {
            error: loadConversationsResult.error,
          })
          throw loadConversationsResult.error
        }

        const loadMessageCountsResult = await loadMessageCounts()
        if (loadMessageCountsResult.isErr()) {
          logger.error('Failed to load message counts during initialization', {
            error: loadMessageCountsResult.error,
          })
          throw loadMessageCountsResult.error
        }

        await resumeInterruptedStreams()
      })()

      await initializePromise
    } finally {
      initializePromise = undefined
    }
  }

  async function loadMessageCounts(): Promise<Result<void, DbError>> {
    const result = await appDb.getMessageCountsByConversation()

    if (result.isErr()) {
      messageCountsByConversation.value = new Map()
      return err(result.error)
    }

    messageCountsByConversation.value = result.value
    return ok(undefined)
  }

  function getMessageCount(conversationId: number): number {
    const current = messageCountsByConversation.value.get(conversationId)
    return current ?? 0
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
      if (index !== -1) {
        const current = messages.value[index]
        current.isStreaming = false
      }
    }
  }

  async function resumeInterruptedStreams(): Promise<void> {
    const streamingMessagesResult = await appDb.getStreamingMessages()

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

  async function refreshMessageById(messageId: number): Promise<Result<void, DbError | ChatError>> {
    const result = await appDb.message.get(messageId)
    if (result.isErr()) return err(result.error)

    const updatedDb = result.value
    if (!updatedDb) return err(new MessageNotFoundError(messageId.toString()))

    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex === -1) {
      return err(new ChatError(`Message ${messageId} not found locally`))
    }

    const updated: Message = {
      id: updatedDb.id!,
      conversationId: updatedDb.conversationId,
      role: updatedDb.role,
      timestamp: updatedDb.timestamp,
      content: updatedDb.content,
      isStreaming: updatedDb.isStreaming,
      model: updatedDb.model,
      systemPrompt: updatedDb.systemPrompt,
      contextReferences: decodeContextReferences(updatedDb.contextReferences),
    }

    messages.value.splice(messageIndex, 1, updated)
    return ok(undefined)
  }

  async function loadConversations(): Promise<Result<void, DbError>> {
    isLoadingConversations.value = true
    const result = await appDb.getAllConversations()

    if (result.isErr()) {
      error.value = 'Failed to load conversations'
      isLoadingConversations.value = false
      return err(result.error)
    }

    conversations.value = [...result.value]
    error.value = undefined
    isLoadingConversations.value = false
    return ok(undefined)
  }

  async function loadMessages(conversationId: number): Promise<Result<void, DbError>> {
    if (!conversationId) {
      messages.value = []
      return ok(undefined)
    }

    const result = await appDb.getMessageByConversation(conversationId)
    if (result.isErr()) {
      messages.value = []
      return err(result.error)
    }

    messages.value = [...result.value]
    return ok(undefined)
  }

  async function createConversation(title: string): Promise<Result<number, DbError | ChatError>> {
    if (creationPromise !== undefined) {
      return creationPromise
    }

    creationPromise = (async (): Promise<Result<number, DbError | ChatError>> => {
      try {
        const addResult = await appDb.conversation.add({
          title,
          isActive: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Conversation)

        if (addResult.isErr()) {
          error.value = 'Failed to create conversation'
          return err(addResult.error)
        }

        const newId = Number(addResult.value)

        const loadError = await loadConversations()
        if (loadError.isErr()) {
          const deleteResult = await appDb.conversation.delete(newId)
          if (deleteResult.isErr()) {
            logger.error('Rollback failed after conversation creation', {
              conversationId: newId,
              error: deleteResult.error,
            })
          }

          return err(new ChatError('Failed to load conversations after creation', loadError.error))
        }

        let conversationExists = false
        for (const conversation of conversations.value) {
          if (conversation.id === newId) {
            conversationExists = true
            break
          }
        }

        if (!conversationExists) {
          const deleteResult = await appDb.conversation.delete(newId)
          if (deleteResult.isErr()) {
            logger.error('Rollback failed after conversation creation', {
              conversationId: newId,
              error: deleteResult.error,
            })
          }

          return err(new ChatError('Created conversation missing from loaded list'))
        }

        messages.value = []

        return ok(newId)
      } finally {
        creationPromise = undefined
      }
    })()

    return creationPromise
  }

  async function updateUserMessage(
    messageId: number,
    newContent: string
  ): Promise<Result<void, MessageNotFoundError | ChatError | DbError>> {
    const message = messages.value.find((messageItem) => messageItem.id === messageId)
    if (!message) return err(new MessageNotFoundError(messageId.toString()))
    if (message.role !== 'user') {
      return err(new ChatError('updateUserMessage can only update user messages'))
    }

    return updateMessageContent(messageId, newContent)
  }

  async function updateMessageContent(
    messageId: number,
    content: string
  ): Promise<Result<void, DbError>> {
    const updateResult = await appDb.updateMessage(messageId, content)
    if (updateResult.isErr()) return err(updateResult.error)

    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex !== -1) {
      const mutable = messages.value[messageIndex]
      mutable.content = content
    }

    return ok(undefined)
  }

  async function createUserMessage(
    conversationId: number,
    content: string,
    metadata?: MessageMetadata,
    contextReferences?: ContextReference[]
  ): Promise<Result<Message, ChatError | DbError>> {
    const createResult = await appDb.createMessage({
      conversationId,
      role: 'user',
      content,
      isStreaming: false,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences,
    })

    if (createResult.isErr()) return err(createResult.error)

    const newMessage: Message = {
      id: createResult.value,
      conversationId,
      role: 'user',
      content,
      timestamp: new Date(),
      isStreaming: false,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
      contextReferences,
    }

    messages.value.push(newMessage)

    const currentCount = messageCountsByConversation.value.get(conversationId) ?? 0
    messageCountsByConversation.value.set(conversationId, currentCount + 1)

    return ok(newMessage)
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
    const createResult = await appDb.createMessage({
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

  async function deleteMessage(messageId: number): Promise<Result<void, DbError | ChatError>> {
    const result = await appDb.deleteMessage(messageId)
    if (result.isErr()) {
      error.value = 'Failed to delete message'
      return err(result.error)
    }

    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex !== -1) {
      const deletedMessage = messages.value[messageIndex]
      messages.value.splice(messageIndex, 1)

      const currentCount = messageCountsByConversation.value.get(deletedMessage.conversationId) ?? 0
      if (currentCount > 0) {
        messageCountsByConversation.value.set(deletedMessage.conversationId, currentCount - 1)
      }
    }

    error.value = undefined
    return ok(undefined)
  }

  async function updateConversationTitle(
    conversationId: number,
    title: string
  ): Promise<Result<void, DbError>> {
    const result = await ResultAsync.fromPromise(
      appDb.conversation.update(conversationId, {
        title,
        updatedAt: new Date(),
      }),
      (unknownError) => {
        if (unknownError instanceof Error) {
          return new DbError(unknownError.message, unknownError)
        }
        return new DbError('Failed to update conversation title', unknownError)
      }
    )

    if (result.isErr()) {
      error.value = 'Failed to update conversation title'
      return err(result.error)
    }

    const conversation = conversations.value.find((conv) => conv.id === conversationId)
    if (conversation) {
      conversation.title = title
      conversation.updatedAt = new Date()
    }

    error.value = undefined
    return ok(undefined)
  }

  async function deleteConversation(
    conversationId: number
  ): Promise<Result<void, DbError | ChatError>> {
    const result = await appDb.deleteConversationWithMessage(conversationId)

    if (result.isErr()) {
      error.value = 'Failed to delete conversation'
      return err(result.error)
    }

    const loadResult = await loadConversations()
    if (loadResult.isErr()) {
      return err(loadResult.error)
    }

    error.value = undefined
    return ok(undefined)
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
      lastContextUsage.value = computeContextUsageForSend(
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

    const injected = buildInjectedText(systemPrompt, contextItems ?? [])

    const last = messagesToSend[messagesToSend.length - 1]
    if (last && last.role === 'user' && injected) {
      last.content = `${last.content}${injected}`
    }

    let fullContentFromServer: string | undefined

    const streamResult = await sendChatSocket(messageId, provider, model, messagesToSend, {
      onChunk: (chunk: string) => {
        const messageIndex = messages.value.findIndex((message) => message.id === messageId)
        if (messageIndex !== -1) {
          const current = messages.value[messageIndex]
          const updated: Message = {
            ...current,
            content: current.content + chunk,
          }
          messages.value.splice(messageIndex, 1, updated)
        }

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
        await deleteMessage(messageId)
        return err(streamResult.error)
      }

      await markMessageStreamingComplete(messageId)

      const idx = messages.value.findIndex((m) => m.id === messageId)
      if (idx !== -1) messages.value[idx].isStreaming = false

      return err(streamResult.error)
    }

    if (fullContentFromServer === undefined) {
      const idx = messages.value.findIndex((m) => m.id === messageId)
      if (idx !== -1) messages.value[idx].isStreaming = false

      return err(new ChatError(`Missing fullContent for completed message ${messageId}`))
    }

    const finalizeResult = await finalizeAssistantMessage(messageId, fullContentFromServer)
    if (finalizeResult.isErr()) return err(finalizeResult.error)

    await markMessageStreamingComplete(messageId)

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
      const creationError = new MessageCreationError('user', userResult.error)
      return err(creationError)
    }

    const historyMessages = messages.value.filter((message) => message.id !== 0)
    return await sendWithHistory(conversationId, historyMessages, {
      ...options,
    })
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
      const errorResult = new MessageNotFoundError(messageId.toString())
      return err(errorResult)
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
      const errorResult = new MessageNotFoundError(assistantMessageId.toString())
      return err(errorResult)
    }

    const historyMessages = messages.value.slice(0, assistantMessageIndex)

    if (!newModelId.includes(':')) {
      const errorResult = new InvalidModelFormatError(newModelId)
      return err(errorResult)
    }

    const [provider, model] = newModelId.split(':')
    if (!provider || !model) {
      const errorResult = new InvalidModelFormatError(newModelId)
      return err(errorResult)
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

  async function finalizeAssistantMessage(
    messageId: number,
    finalContent: string
  ): Promise<Result<void, DbError>> {
    return updateMessageContent(messageId, finalContent)
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
    deleteConversation,
    updateConversationTitle,

    updateUserMessage,
    deleteMessage,

    generateConversationTitle,
    resumeInterruptedStreams,

    sendMessage,
    resendFromMessage,
    rewriteWithModel,
    finalizeAssistantMessage,

    markAllStreamingCompleteInCurrentConversation,
  }
})
