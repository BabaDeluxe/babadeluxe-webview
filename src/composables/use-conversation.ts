import { ref, readonly, inject, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDebounceFn, useStorage, useIntervalFn } from '@vueuse/core'
import type { Message, Conversation } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import type { AppDb } from '@/database/app-db'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'
import { resumeStreamingMessage, hasAnyStreamingMessage } from '@/chat-socket-listener'
import { ResultAsync } from 'neverthrow'

const messages = ref<Message[]>([])
const conversations = ref<Conversation[]>([])
const currentConversationId = useStorage('current-conversation-id', 0)
const isLoading = ref(false)
const error = ref<string | undefined>()

export function useConversation() {
  const logger: ConsoleLogger = inject(LOGGER_KEY)!
  const appDb: AppDb = inject(APP_DB_KEY)!

  const isCreatingConversation = ref(false)

  const resumeInterruptedStreams = async (): Promise<void> => {
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

    for (const msg of streamingMessages) {
      let didReceiveChunk = false

      resumeStreamingMessage(msg.id, async () => {
        didReceiveChunk = true
        const updatedResult = await appDb.message.get(msg.id)

        if (updatedResult.isErr()) {
          logger.error(`Failed to get updated message: ${updatedResult.error.message}`)
          return
        }

        const updated = updatedResult.value
        if (!updated) return

        const index = messages.value.findIndex((m) => m.id === msg.id)
        if (index !== -1) {
          messages.value[index] = { ...updated }
        }
      })

      setTimeout(async () => {
        if (!didReceiveChunk) {
          logger.log(`Message ${msg.id} appears complete, cleaning up`)
          const updateResult = await appDb.message.update(msg.id, { isStreaming: false })
          if (updateResult.isErr()) {
            logger.error(`Failed to mark message as complete: ${updateResult.error.message}`)
          }

          const updatedResult = await appDb.message.get(msg.id)
          if (updatedResult.isErr()) {
            logger.error(`Failed to get updated message: ${updatedResult.error.message}`)
            return
          }

          const updated = updatedResult.value
          if (updated) {
            const index = messages.value.findIndex((m) => m.id === msg.id)
            if (index !== -1) {
              messages.value[index] = { ...updated }
            }
          }
        }
      }, 1000)
    }

    logger.log('Stream recovery complete')
  }

  const refreshStreamingMessages = useIntervalFn(
    async () => {
      if (!hasAnyStreamingMessage()) return

      const streamingIds = messages.value.filter((m) => m.isStreaming).map((m) => m.id)

      for (const id of streamingIds) {
        const updatedResult = await appDb.message.get(id)
        if (updatedResult.isErr()) {
          logger.error(`Failed to get updated message: ${updatedResult.error.message}`)
          continue
        }

        const updated = updatedResult.value
        if (!updated) continue

        const index = messages.value.findIndex((m) => m.id === id)
        if (index !== -1 && messages.value[index].content !== updated.content) {
          messages.value[index] = { ...updated }
        }
      }
    },
    500,
    { immediate: false }
  )

  watch(
    hasAnyStreamingMessage,
    (isStreaming) => {
      if (isStreaming) {
        refreshStreamingMessages.resume()
      } else {
        refreshStreamingMessages.pause()
      }
    },
    { immediate: true }
  )

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
      const highestId = Math.max(...conversations.value.map((c) => c.id))
      currentConversationId.value = highestId
    }

    if (currentConversationId.value !== 0) {
      await loadMessages()
    }
  }

  async function createConversation(title: string): Promise<number | undefined> {
    if (isCreatingConversation.value) {
      logger.warn('Conversation creation already in progress')
      return undefined
    }

    isCreatingConversation.value = true

    const result = await appDb.conversation.add({
      title,
      isActive: 1,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Conversation)

    isCreatingConversation.value = false

    if (result.isErr()) {
      error.value = 'Failed to create conversation'
      logger.error(`Failed to create conversation: ${result.error.message}`)
      return undefined
    }

    const newId = Number(result.value)
    await loadConversations()
    currentConversationId.value = newId
    messages.value = []

    return newId
  }

  async function addOrUpdateMessage(
    content: string,
    role: 'user' | 'assistant',
    messageId?: number
  ): Promise<Message | boolean> {
    if (messageId) {
      return updateMessage(messageId, content)
    }

    const addResult = await addMessage(content, role)
    return addResult ?? false
  }

  async function deleteMessage(messageId: number): Promise<boolean> {
    const result = await appDb.deleteMessage(messageId)

    if (result.isErr()) {
      error.value = 'Failed to delete message'
      logger.error(`Failed to delete message: ${result.error.message}`)
      return false
    }

    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }

    const existsResult = await appDb.conversation.get(currentConversationId.value)

    if (existsResult.isErr()) {
      logger.error(`Failed to check conversation existence: ${existsResult.error.message}`)
      return false
    }

    if (existsResult.value === undefined) {
      logger.log(`Conversation ${currentConversationId.value} was cascade-deleted`)
      await handleConversationSwitch()
    } else {
      const updateResult = await ResultAsync.fromPromise(
        appDb.conversation.update(currentConversationId.value, {
          updatedAt: new Date(),
          messageCount: messages.value.length,
        }),
        (error) => new Error(String(error))
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
      (error) => new Error(String(error))
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

  function generateConversationTitle(firstMessage: string): string {
    const title = firstMessage.trim().slice(0, 50)
    return title.length < firstMessage.trim().length ? `${title}...` : title
  }

  async function deleteConversation(conversationId: number): Promise<boolean> {
    const result = await appDb.deleteConversationWithMessage(conversationId)

    if (result.isErr()) {
      error.value = 'Failed to delete conversation'
      logger.error(`Failed to delete conversation: ${result.error.message}`)
      return false
    }

    if (conversationId === currentConversationId.value) {
      await handleConversationSwitch()
    } else {
      await loadConversations()
    }

    error.value = undefined
    return true
  }

  async function switchConversation(conversationId: number): Promise<void> {
    if (conversationId === currentConversationId.value) return

    currentConversationId.value = conversationId
    await loadMessages()
  }

  async function addMessage(
    content: string,
    role: 'user' | 'assistant'
  ): Promise<Message | undefined> {
    if (currentConversationId.value === 0) {
      const newId = await createConversation('New Conversation')
      if (!newId) return
    }

    const result = await appDb.createMessage({
      conversationId: currentConversationId.value,
      role,
      content,
      isStreaming: false,
    })

    if (result.isErr()) {
      error.value = 'Failed to add message'
      logger.error(`Failed to add message: ${result.error.message}`)
      return
    }

    const newMessage: Message = {
      id: result.value,
      conversationId: currentConversationId.value,
      role,
      content,
      timestamp: new Date(),
      isStreaming: false,
    }

    messages.value.push(newMessage)

    const updateResult = await ResultAsync.fromPromise(
      appDb.conversation.update(currentConversationId.value, {
        updatedAt: new Date(),
        messageCount: messages.value.length,
      }),
      (error) => new Error(String(error))
    )

    if (updateResult.isErr()) {
      logger.error(`Failed to update conversation: ${updateResult.error.message}`)
    }

    error.value = undefined
    return newMessage
  }

  async function handleConversationSwitch(): Promise<void> {
    await loadConversations()

    if (conversations.value.length > 0) {
      const highestId = Math.max(...conversations.value.map((c) => c.id))
      currentConversationId.value = highestId
      await loadMessages()
    } else {
      const newId = await createConversation('New Conversation')
      if (newId) {
        currentConversationId.value = newId
        messages.value = []
      }
    }
  }

  async function updateMessage(messageId: number, content: string): Promise<boolean> {
    const result = await appDb.updateMessage(messageId, content)

    if (result.isErr()) {
      error.value = 'Failed to update message'
      logger.error(`Failed to update message: ${result.error.message}`)
      return false
    }

    const message = messages.value.find((m) => m.id === messageId)
    if (message) {
      message.content = content
    }

    error.value = undefined
    return true
  }

  const debouncedAutoSave = useDebounceFn(
    async (id: number, content: string) => {
      const result = await appDb.updateMessage(id, content)
      if (result.isErr()) {
        logger.error(`Auto-save failed: ${result.error.message}`)
      }
    },
    500,
    { maxWait: 2000 }
  )

  onMounted(async () => {
    await loadConversations()
    await initializeCurrentConversation()
    await resumeInterruptedStreams()
  })

  onBeforeUnmount(() => {
    refreshStreamingMessages.pause()
  })

  return {
    messages: readonly(messages),
    conversations: readonly(conversations),
    currentConversationId,
    isLoading: readonly(isLoading),
    error,

    loadMessages,
    loadConversations,
    initializeCurrentConversation,
    createConversation,
    addOrUpdateMessage,
    updateConversationTitle,
    deleteMessage,
    deleteConversation,
    switchConversation,
    generateConversationTitle,
    debouncedAutoSave,
    resumeInterruptedStreams,
  }
}
