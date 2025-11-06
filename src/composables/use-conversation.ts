import { ref, readonly, inject } from 'vue'
import { useDebounceFn, useStorage } from '@vueuse/core'
import type { Message, Conversation } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import type { AppDb } from '@/database/app-db'
import { APP_DB_KEY, LOGGER_KEY } from '@/injection-keys'

const messages = ref<Message[]>([])
const conversations = ref<Conversation[]>([])
const currentConversationId = useStorage('current-conversation-id', 0)
const isLoading = ref(false)
const error = ref<string | undefined>()

export function useConversation() {
  const logger: ConsoleLogger = inject(LOGGER_KEY)!
  const appDb: AppDb = inject(APP_DB_KEY)!

  const _isCreatingConversation = ref(false)

  async function loadMessages(): Promise<void> {
    if (!currentConversationId.value || currentConversationId.value === 0) {
      messages.value = []
      return
    }

    isLoading.value = true
    const result = await appDb.getMessageByConversation(currentConversationId.value)

    if (result.isErr()) {
      error.value = 'Failed to load messages'
      logger.error('Failed to load messages', result.error.message)
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
      logger.error('Failed to load conversations', result.error.message)
    } else {
      conversations.value = [...result.value]
      error.value = undefined
    }
  }

  async function initializeCurrentConversation(): Promise<void> {
    // Validate that stored conversation actually exists
    if (currentConversationId.value !== 0) {
      const exists = await appDb.conversation.get(currentConversationId.value)

      if (!exists) {
        logger.warn(
          `Stored conversation ${currentConversationId.value} no longer exists - resetting`
        )
        currentConversationId.value = 0
      }
    }

    // Set to highest ID if not set
    if (currentConversationId.value === 0 && conversations.value.length > 0) {
      const highestId = Math.max(...conversations.value.map((c) => c.id))
      currentConversationId.value = highestId
    }

    // Load messages if we have a valid conversation
    if (currentConversationId.value !== 0) {
      await loadMessages()
    }
  }

  async function createConversation(title: string): Promise<number | undefined> {
    if (_isCreatingConversation.value) {
      logger.warn('Conversation creation already in progress')
      return undefined
    }

    _isCreatingConversation.value = true

    try {
      const conversationId = await appDb.conversation.add({
        title,
        isActive: 1,
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const newId = Number(conversationId)
      await loadConversations()
      currentConversationId.value = newId
      messages.value = []

      return newId
    } catch (error_) {
      error.value = 'Failed to create conversation'
      logger.error('Failed to create conversation', error_ as Error)
      return undefined
    } finally {
      _isCreatingConversation.value = false
    }
  }

  async function addOrUpdateMessage(
    content: string,
    role: 'user' | 'assistant',
    messageId?: number
  ): Promise<Message | boolean> {
    if (messageId) {
      return _updateMessage(messageId, content)
    }

    const addResult = await _addMessage(content, role)
    return addResult ?? false
  }

  async function deleteMessage(messageId: number): Promise<boolean> {
    const result = await appDb.deleteMessage(messageId)

    if (result.isErr()) {
      error.value = 'Failed to delete message'
      logger.error('Failed to delete message', result.error.message)
      return false
    }

    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      messages.value.splice(index, 1)
    }

    // Check if conversation was cascade-deleted
    const conversationStillExists = await appDb.conversation.get(currentConversationId.value)

    if (!conversationStillExists) {
      logger.log(`Conversation ${currentConversationId.value} was cascade-deleted`)
      await _handleConversationSwitch()
    } else {
      // Just update message count
      try {
        await appDb.conversation.update(currentConversationId.value, {
          messageCount: messages.value.length,
          updatedAt: new Date(),
        })
      } catch (error_) {
        logger.error('Failed to update conversation message count', error_ as Error)
      }
    }

    error.value = undefined
    return true
  }

  async function updateConversationTitle(conversationId: number, title: string): Promise<boolean> {
    try {
      await appDb.conversation.update(conversationId, {
        title,
        updatedAt: new Date(),
      })

      const conversation = conversations.value.find((c) => c.id === conversationId)
      if (conversation) {
        conversation.title = title
        conversation.updatedAt = new Date()
      }

      error.value = undefined
      return true
    } catch (error_) {
      error.value = 'Failed to update conversation title'
      logger.error('Failed to update conversation title', error_ as Error)
      return false
    }
  }

  function generateConversationTitle(firstMessage: string): string {
    const title = firstMessage.trim().slice(0, 50)
    return title.length < firstMessage.trim().length ? title + '...' : title
  }

  async function deleteConversation(conversationId: number): Promise<boolean> {
    const result = await appDb.deleteConversationWithMessage(conversationId)

    if (result.isErr()) {
      error.value = 'Failed to delete conversation'
      logger.error('Failed to delete conversation', result.error.message)
      return false
    }

    if (conversationId === currentConversationId.value) {
      await _handleConversationSwitch()
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

  async function _addMessage(
    content: string,
    role: 'user' | 'assistant'
  ): Promise<Message | undefined> {
    if (currentConversationId.value === 0) {
      const newId = await createConversation('New Conversation')
      if (!newId) return undefined
    }

    const result = await appDb.createMessage({
      conversationId: currentConversationId.value,
      role,
      content,
      isStreaming: false,
    })

    if (result.isErr()) {
      error.value = 'Failed to add message'
      logger.error('Failed to add message', result.error.message)
      return undefined
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

    try {
      await appDb.conversation.update(currentConversationId.value, {
        updatedAt: new Date(),
        messageCount: messages.value.length,
      })
    } catch (error_) {
      logger.error('Failed to update conversation', error_ as Error)
    }

    error.value = undefined
    return newMessage
  }

  async function _handleConversationSwitch(): Promise<void> {
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

  async function _updateMessage(messageId: number, content: string): Promise<boolean> {
    const result = await appDb.updateMessage(messageId, content)

    if (result.isErr()) {
      error.value = 'Failed to update message'
      logger.error('Failed to update message', result.error.message)
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
        logger.error('Auto-save failed', result.error.message)
      }
    },
    500,
    { maxWait: 2000 }
  )

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
  }
}
