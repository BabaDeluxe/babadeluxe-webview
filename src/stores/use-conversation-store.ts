import { defineStore } from 'pinia'
import { ref, inject } from 'vue'
import { useStorage } from '@vueuse/core'
import { ResultAsync, type Result, err, ok } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import type { Message, Conversation } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'
import { useChatSocket } from '@/composables/use-chat-socket'
import {
  MessageNotFoundError,
  InvalidModelFormatError,
  MessageCreationError,
  NoUserMessageError,
  ChatError,
} from '@/errors'

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}

type SendOptions = {
  provider: string
  model: string
  systemPrompt: string | undefined
  existingAssistantId?: number
  onChunk?: (messageId: number, chunk: string) => void
  onComplete?: (messageId: number) => void
  onError?: (error: Error) => void
}

type MessageMetadata = { model?: string; systemPrompt?: string }

export const useConversationStore = defineStore('conversation', () => {
  const logger: ConsoleLogger = inject(LOGGER_KEY)!
  const appDb: AppDb = inject(APP_DB_KEY)!

  const { sendMessage: sendChatSocket, resumeStreamingMessage } = useChatSocket()

  const messages = ref<Message[]>([])
  const conversations = ref<Conversation[]>([])
  const currentConversationId = useStorage<number>('current-conversation-id', 0)
  const isLoading = ref(false)
  const error = ref<string | undefined>(undefined)

  let creationPromise: Promise<Result<number, Error>> | undefined = undefined

  let initializePromise: Promise<void> | undefined

  async function initialize(): Promise<void> {
    if (initializePromise) return initializePromise

    try {
      initializePromise = (async () => {
        await loadConversations()
        await initializeCurrentConversation()
        await resumeInterruptedStreams()
      })()

      await initializePromise
    } finally {
      initializePromise = undefined
    }
  }

  async function resumeInterruptedStreams(): Promise<void> {
    const streamingMessagesResult = await appDb.getStreamingMessages()

    if (streamingMessagesResult.isErr()) {
      logger.error(`Failed to get streaming messages: ${streamingMessagesResult.error.message}`)
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

          void appDb.message.update(streamingMessage.id, {
            isStreaming: false,
            content: fullContent,
          })
        },
      })

      setTimeout(async () => {
        if (didReceiveChunk) return

        logger.log(`Message ${streamingMessage.id} appears complete, cleaning up`)
        const updateResult = await appDb.message.update(streamingMessage.id, { isStreaming: false })
        if (updateResult.isErr()) {
          logger.error(`Failed to mark message as complete: ${updateResult.error.message}`)
        }

        const updatedResult = await appDb.message.get(streamingMessage.id)
        if (updatedResult.isErr()) {
          logger.error(`Failed to get updated message: ${updatedResult.error.message}`)
          return
        }

        const updatedMessage = updatedResult.value
        if (!updatedMessage) return

        const messageIndex = messages.value.findIndex(
          (message) => message.id === streamingMessage.id
        )
        if (messageIndex !== -1) {
          messages.value.splice(messageIndex, 1, { ...updatedMessage })
        }
      }, 1000)
    }

    logger.log('Stream recovery complete')
  }

  async function refreshMessageById(messageId: number): Promise<Result<void, Error>> {
    const result = await appDb.message.get(messageId)
    if (result.isErr()) return err(result.error)

    const updated = result.value
    if (!updated) return err(new MessageNotFoundError(messageId.toString()))

    const messageIndex = messages.value.findIndex((m) => m.id === messageId)
    if (messageIndex === -1) {
      return err(new ChatError(`Message ${messageId} not found locally`))
    }

    messages.value.splice(messageIndex, 1, { ...updated })
    return ok(undefined)
  }

  async function loadMessages(): Promise<void> {
    if (!currentConversationId.value || currentConversationId.value === 0) {
      messages.value = []
      return
    }

    isLoading.value = true
    const result = await appDb.getMessageByConversation(currentConversationId.value)

    if (result.isErr()) {
      error.value = 'Failed to load messages'
      logger.error(`Failed to load messages: ${result.error.message}`)
      messages.value = []
    } else {
      messages.value = [...result.value]
      error.value = undefined
    }

    isLoading.value = false
  }

  async function loadConversations(): Promise<void> {
    const result = await appDb.getAllConversations()

    if (result.isErr()) {
      error.value = 'Failed to load conversations'
      logger.error(`Failed to load conversations: ${result.error.message}`)
    } else {
      conversations.value = [...result.value]
      error.value = undefined
    }
  }

  async function initializeCurrentConversation(): Promise<void> {
    if (currentConversationId.value !== 0) {
      const existsResult = await appDb.conversation.get(currentConversationId.value)

      if (existsResult.isErr()) {
        logger.error(`Failed to check conversation existence: ${existsResult.error.message}`)
        currentConversationId.value = 0
      } else if (existsResult.value === undefined) {
        logger.warn(`Stored conversation ${currentConversationId.value} no longer exists`)
        currentConversationId.value = 0
      }
    }

    if (currentConversationId.value === 0 && conversations.value.length > 0) {
      const highestId = Math.max(...conversations.value.map((conversation) => conversation.id))
      currentConversationId.value = highestId
    }

    if (currentConversationId.value !== 0) {
      await loadMessages()
    }
  }

  async function createConversation(title: string): Promise<Result<number, Error>> {
    if (creationPromise !== undefined) {
      logger.log('Conversation creation already in progress, reusing existing promise')
      return creationPromise
    }

    creationPromise = (async (): Promise<Result<number, Error>> => {
      try {
        const addResult = await appDb.conversation.add({
          title,
          isActive: 1,
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Conversation)

        if (addResult.isErr()) {
          error.value = 'Failed to create conversation'
          logger.error(`Failed to create conversation: ${addResult.error.message}`)
          return err(addResult.error)
        }

        const newId = Number(addResult.value)

        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        const loadError = await loadConversations()
        if (loadError !== undefined) {
          logger.error('loadConversations failed after successful DB write, rolling back')

          const deleteResult = await appDb.conversation.delete(newId)
          if (deleteResult.isErr()) {
            logger.error(`Rollback failed for conversation ${newId}: ${deleteResult.error.message}`)
          }

          return err(new ChatError('Failed to load conversations after creation'))
        }

        const conversationExists = conversations.value.some(
          (conversation) => conversation.id === newId
        )
        if (!conversationExists) {
          logger.error(`New conversation ${newId} not in loaded list, rolling back`)

          const deleteResult = await appDb.conversation.delete(newId)
          if (deleteResult.isErr()) {
            logger.error(`Rollback failed for conversation ${newId}: ${deleteResult.error.message}`)
          }

          return err(new ChatError('Created conversation missing from loaded list'))
        }

        currentConversationId.value = newId
        messages.value = []

        logger.log(`Created conversation ${newId}: "${title}"`)
        return ok(newId)
      } finally {
        creationPromise = undefined
      }
    })()

    return creationPromise
  }

  async function switchConversation(conversationId: number): Promise<void> {
    if (conversationId === currentConversationId.value) return
    currentConversationId.value = conversationId
    await loadMessages()
  }

  async function handleConversationSwitch(): Promise<Result<void, ChatError>> {
    await loadConversations()

    if (conversations.value.length > 0) {
      const highestId = Math.max(...conversations.value.map((conversation) => conversation.id))
      currentConversationId.value = highestId
      await loadMessages()
      return ok()
    }

    const newId = await createConversation('New Conversation')
    if (newId.isErr()) return err(new ChatError('Failed to switch conversation'))

    currentConversationId.value = newId.value
    messages.value = []

    return ok()
  }

  async function updateUserMessage(
    messageId: number,
    newContent: string
  ): Promise<Result<void, Error>> {
    const message = messages.value.find((m) => m.id === messageId)
    if (!message) return err(new MessageNotFoundError(messageId.toString()))
    if (message.role !== 'user')
      return err(new ChatError('updateUserMessage can only update user messages'))

    return updateMessageContent(messageId, newContent)
  }

  const requireConversationId = (): Result<number, Error> => {
    if (!currentConversationId.value || currentConversationId.value === 0) {
      return err(new ChatError('No active conversation'))
    }
    return ok(currentConversationId.value)
  }

  async function updateMessageContent(
    messageId: number,
    content: string
  ): Promise<Result<void, Error>> {
    const updateResult = await appDb.updateMessage(messageId, content)
    if (updateResult.isErr()) return err(updateResult.error)

    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex !== -1) {
      ;(messages.value[messageIndex] as Mutable<Message>).content = content
    }

    return ok(undefined)
  }

  async function createUserMessage(
    content: string,
    metadata?: MessageMetadata
  ): Promise<Result<Message, Error>> {
    const conversationIdResult = requireConversationId()
    if (conversationIdResult.isErr()) return err(conversationIdResult.error)

    const createResult = await appDb.createMessage({
      conversationId: conversationIdResult.value,
      role: 'user',
      content,
      isStreaming: false,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
    })

    if (createResult.isErr()) return err(createResult.error)

    const newMessage: Message = {
      id: createResult.value,
      conversationId: conversationIdResult.value,
      role: 'user',
      content,
      timestamp: new Date(),
      isStreaming: false,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
    }

    messages.value.push(newMessage)
    return ok(newMessage)
  }

  async function createOrResetAssistantStreamingMessage(
    existingAssistantId: number | undefined,
    metadata?: MessageMetadata
  ): Promise<Result<Message, Error>> {
    const conversationIdResult = requireConversationId()
    if (conversationIdResult.isErr()) return err(conversationIdResult.error)

    if (existingAssistantId !== undefined) {
      const updateResult = await appDb.message.update(existingAssistantId, {
        content: '',
        isStreaming: true,
        model: metadata?.model,
        systemPrompt: metadata?.systemPrompt,
      })

      if (updateResult.isErr()) return err(updateResult.error)

      const messageIndex = messages.value.findIndex((message) => message.id === existingAssistantId)
      if (messageIndex === -1) {
        return err(new ChatError(`Assistant message ${existingAssistantId} not found locally`))
      }

      const oldMessage = messages.value[messageIndex]
      const updated: Message = {
        ...oldMessage,
        content: '',
        isStreaming: true,
        model: metadata?.model ?? oldMessage.model,
        systemPrompt: metadata?.systemPrompt ?? oldMessage.systemPrompt,
        timestamp: oldMessage.timestamp,
      }

      messages.value.splice(messageIndex, 1, updated)
      return ok(updated)
    }

    const createResult = await appDb.createMessage({
      conversationId: conversationIdResult.value,
      role: 'assistant',
      content: '',
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
    })

    if (createResult.isErr()) return err(createResult.error)

    const newMessage: Message = {
      id: createResult.value,
      conversationId: conversationIdResult.value,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      model: metadata?.model,
      systemPrompt: metadata?.systemPrompt,
    }

    messages.value.push(newMessage)
    return ok(newMessage)
  }

  // const addOrUpdateMessage = async (
  //   content: string,
  //   role: 'user' | 'assistant',
  //   existingId?: number,
  //   metadata?: { model?: string; systemPrompt?: string }
  // ): Promise<Message | boolean> => {
  //   if (existingId !== undefined) {
  //     if (role === 'assistant' && content === '') {
  //       const assistantResult = await createOrResetAssistantStreamingMessage(existingId, metadata)
  //       return assistantResult.isOk() ? assistantResult.value : false
  //     }

  //     const updateResult = await updateMessageContent(existingId, content)
  //     return updateResult.isOk()
  //   }

  //   if (role === 'assistant' && content === '') {
  //     const assistantResult = await createOrResetAssistantStreamingMessage(undefined, metadata)
  //     return assistantResult.isOk() ? assistantResult.value : false
  //   }

  //   if (role === 'user') {
  //     const userResult = await createUserMessage(content, metadata)
  //     return userResult.isOk() ? userResult.value : false
  //   }

  //   // keep your “rare non-streaming assistant create” branch if you truly need it
  //   return false
  // }

  async function deleteMessage(messageId: number): Promise<boolean> {
    const result = await appDb.deleteMessage(messageId)
    if (result.isErr()) {
      error.value = 'Failed to delete message'
      logger.error(`Failed to delete message: ${result.error.message}`)
      return false
    }

    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex !== -1) {
      messages.value.splice(messageIndex, 1)
    }

    const existsResult = await appDb.conversation.get(currentConversationId.value)
    if (existsResult.isErr()) {
      logger.error(`Failed to check conversation existence: ${existsResult.error.message}`)
      return false
    }

    if (existsResult.value === undefined) {
      logger.log(`Conversation ${currentConversationId.value} was cascade-deleted`)

      const handleConversationSwitchResult = await handleConversationSwitch()
      if (handleConversationSwitchResult.isErr()) {
        error.value = 'Failed to switch conversation'
        logger.error(
          `Failed to switch conversation ${handleConversationSwitchResult.error.message}`
        )
      }
    } else {
      const updateResult = await ResultAsync.fromPromise(
        appDb.conversation.update(currentConversationId.value, {
          updatedAt: new Date(),
          messageCount: messages.value.length,
        }),
        (unknownError) => new ChatError(String(unknownError))
      )

      if (updateResult.isErr()) {
        logger.error(`Failed to update conversation message count: ${updateResult.error.message}`)
      }
    }

    error.value = undefined
    return true
  }

  async function updateConversationTitle(conversationId: number, title: string): Promise<boolean> {
    const result = await ResultAsync.fromPromise(
      appDb.conversation.update(conversationId, {
        title,
        updatedAt: new Date(),
      }),
      (unknownError) => new ChatError(String(unknownError))
    )

    if (result.isErr()) {
      error.value = 'Failed to update conversation title'
      logger.error(`Failed to update conversation title: ${result.error.message}`)
      return false
    }

    const conversation = conversations.value.find((c) => c.id === conversationId)
    if (conversation) {
      conversation.title = title
      conversation.updatedAt = new Date()
    }

    error.value = undefined
    return true
  }

  async function deleteConversation(conversationId: number): Promise<boolean> {
    const result = await appDb.deleteConversationWithMessage(conversationId)

    if (result.isErr()) {
      error.value = 'Failed to delete conversation'
      logger.error(`Failed to delete conversation ${result.error.message}`)
      return false
    }

    if (conversationId === currentConversationId.value) {
      const handleConversationSwitchResult = await handleConversationSwitch()
      if (handleConversationSwitchResult.isErr()) {
        error.value = 'Failed to switch conversation'
        logger.error(
          `Failed to switch conversation ${handleConversationSwitchResult.error.message}`
        )
      }

      return true
    }

    await loadConversations()

    error.value = undefined
    return true
  }

  function generateConversationTitle(firstMessage: string): string {
    const title = firstMessage.trim().slice(0, 50)
    return title.length < firstMessage.trim().length ? `${title}...` : title
  }

  const debouncedAutoSave = async (messageId: number, content: string): Promise<void> => {
    const updateResult = await appDb.updateMessage(messageId, content)
    if (updateResult.isErr()) {
      logger.error(`Failed to auto-save message ${messageId}:`, updateResult.error.message)
    }
  }

  async function sendWithHistory(
    historyMessages: Message[],
    options: SendOptions
  ): Promise<Result<number, Error>> {
    const { provider, model, systemPrompt, existingAssistantId, onChunk, onComplete, onError } =
      options

    const assistantResult = await createOrResetAssistantStreamingMessage(existingAssistantId, {
      model: `${provider}:${model}`,
      systemPrompt,
    })

    if (assistantResult.isErr()) {
      const creationError = new MessageCreationError('assistant', assistantResult.error)
      logger.error(creationError.message)
      return err(creationError)
    }

    const messageId = assistantResult.value.id

    const messagesToSend = historyMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    let fullContentFromServer: string | undefined

    const streamResult = await sendChatSocket(
      messageId,
      provider,
      model,
      messagesToSend,
      systemPrompt,
      {
        onChunk: (chunk: string) => {
          const messageIndex = messages.value.findIndex((m) => m.id === messageId)
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

          const messageIndex = messages.value.findIndex((m) => m.id === messageId)
          if (messageIndex === -1) return

          const current = messages.value[messageIndex]
          const updated: Message = {
            ...current,
            content: fullContent, // authoritative
          }
          messages.value.splice(messageIndex, 1, updated)
        },
        onError: (errorMessage: string) => {
          onError?.(new ChatError(errorMessage))
        },
      }
    )

    if (streamResult.isErr()) {
      logger.error('Stream failed:', streamResult.error.message)
      onError?.(streamResult.error)

      // If this was a *new* assistant message, delete it (existing behavior).
      if (existingAssistantId === undefined) {
        await deleteMessage(messageId)
        return err(streamResult.error)
      }

      // If this was a *reused* assistant message, keep partial content but stop streaming.
      const markCompleteResult = await appDb.message.update(messageId, { isStreaming: false })
      if (markCompleteResult.isErr()) {
        logger.error(
          `Failed to mark message ${messageId} as complete: ${markCompleteResult.error.message}`
        )
        return err(streamResult.error)
      }

      const refreshResult = await refreshMessageById(messageId)
      if (refreshResult.isErr()) {
        logger.error(`Failed to refresh message ${messageId}: ${refreshResult.error.message}`)
        return err(streamResult.error)
      }

      return err(streamResult.error)
    }

    // Success: persist the real final content (do not trust chunk accumulation)
    if (fullContentFromServer === undefined) {
      return err(new ChatError(`Missing fullContent for completed message ${messageId}`))
    }

    const finalizeResult = await finalizeAssistantMessage(messageId, fullContentFromServer)
    if (finalizeResult.isErr()) return err(finalizeResult.error)

    const markCompleteResult = await appDb.message.update(messageId, { isStreaming: false })
    if (markCompleteResult.isErr()) return err(markCompleteResult.error)

    const refreshResult = await refreshMessageById(messageId)
    if (refreshResult.isErr()) return err(refreshResult.error)

    onComplete?.(messageId)
    return ok(messageId)
  }

  async function sendMessage(
    newUserMessage: string,
    options: SendOptions
  ): Promise<Result<number, Error>> {
    const userResult = await createUserMessage(newUserMessage)
    if (userResult.isErr()) {
      const creationError = new MessageCreationError('user', userResult.error)
      logger.error(creationError.message)
      return err(creationError)
    }

    const historyMessages = messages.value.filter((message) => message.id !== 0)

    const result = await sendWithHistory(historyMessages, options)
    return result
  }

  async function resendFromMessage(
    messageId: number,
    options: SendOptions
  ): Promise<Result<number, Error>> {
    const messageIndex = messages.value.findIndex((message) => message.id === messageId)
    if (messageIndex === -1) {
      const errorResult = new MessageNotFoundError(messageId.toString())
      logger.error(errorResult.message)
      return err(errorResult)
    }

    const historyMessages = messages.value.slice(0, messageIndex + 1)
    const result = await sendWithHistory(historyMessages, options)

    const assistantMessageIdToRefresh =
      options.existingAssistantId ?? (result.isOk() ? result.value : undefined)

    if (assistantMessageIdToRefresh !== undefined) {
      const refreshResult = await refreshMessageById(assistantMessageIdToRefresh)
      if (refreshResult.isErr()) {
        logger.error(
          `Failed to refresh message ${assistantMessageIdToRefresh}: ${refreshResult.error.message}`
        )
      }
    }

    return result
  }

  async function rewriteWithModel(
    assistantMessageId: number,
    newModelId: string,
    options: Omit<SendOptions, 'provider' | 'model'>
  ): Promise<Result<number, Error>> {
    const messageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    if (messageIndex === -1) {
      const errorResult = new MessageNotFoundError(assistantMessageId.toString())
      logger.error(errorResult.message)
      return err(errorResult)
    }

    const userMessageIndex = messageIndex - 1

    if (userMessageIndex < 0) {
      const errorResult = new NoUserMessageError(assistantMessageId.toString())
      logger.error(errorResult.message)
      return err(errorResult)
    }

    const historyMessages = messages.value.slice(0, userMessageIndex + 1)

    if (!newModelId.includes(':')) {
      const errorResult = new InvalidModelFormatError(newModelId)
      logger.error(errorResult.message)
      return err(errorResult)
    }

    const [provider, model] = newModelId.split(':')
    if (!provider || !model) {
      const errorResult = new InvalidModelFormatError(newModelId)
      logger.error(errorResult.message)
      return err(errorResult)
    }

    const result = await sendWithHistory(historyMessages, {
      ...options,
      provider,
      model,
      existingAssistantId: assistantMessageId,
    })

    const refreshResult = await refreshMessageById(assistantMessageId)

    if (refreshResult.isErr()) {
      logger.error(`Failed to refresh assistant message: ${refreshResult.error.message}`)
    }

    return result
  }

  async function finalizeAssistantMessage(
    messageId: number,
    finalContent: string
  ): Promise<Result<void, Error>> {
    return updateMessageContent(messageId, finalContent)
  }

  return {
    // State
    messages,
    conversations,
    currentConversationId,
    isLoading,
    error,

    // Actions
    initialize,
    refreshMessageById,
    loadMessages,
    loadConversations,
    initializeCurrentConversation,
    switchConversation,

    createConversation,
    deleteConversation,
    updateConversationTitle,

    updateUserMessage,
    deleteMessage,

    generateConversationTitle,
    resumeInterruptedStreams,
    debouncedAutoSave,

    sendMessage,
    resendFromMessage,
    rewriteWithModel,

    finalizeAssistantMessage,
  }
})
