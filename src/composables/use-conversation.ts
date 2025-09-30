import { ref, readonly, inject } from 'vue'
import { useDebounceFn, useStorage } from '@vueuse/core'
import type { Message, Conversation } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import { db } from '../database/db'
import { IocEnum } from '@/enums/ioc-enum'

export function useConversation() {
  const logger: ConsoleLogger = inject(IocEnum.LOGGER)!

  const messages = ref<Message[]>([])
  const conversations = ref<Conversation[]>([])
  const currentConversationId = useStorage('current-conversation-id', 0)
  const isLoading = ref(false)
  const error = ref<string | undefined>()

  const loadMessages = async (): Promise<void> => {
    if (!currentConversationId.value || currentConversationId.value === 0) {
      messages.value = []
      return
    }

    try {
      isLoading.value = true
      messages.value = await db.getMessageByConversation(currentConversationId.value)
      error.value = undefined
    } catch (error_) {
      error.value = 'Failed to load messages'
      logger.error('Database error:', error_ as Error)
      messages.value = []
    } finally {
      isLoading.value = false
    }
  }

  const loadConversations = async (): Promise<void> => {
    try {
      conversations.value = await db.getActiveConversations()
      error.value = undefined
    } catch (error_) {
      error.value = 'Failed to load conversations'
      logger.error('Database error:', error_ as Error)
    }
  }

  const initializeCurrentConversation = async (): Promise<void> => {
    if (currentConversationId.value === 0 && conversations.value.length > 0) {
      const highestId = Math.max(...conversations.value.map((c) => c.id))
      currentConversationId.value = highestId
      await loadMessages()
    }
  }

  const createConversation = async (title: string): Promise<number | undefined> => {
    try {
      const conversationId = await db.conversation.add({
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
      logger.error('Database error:', error_ as Error)
      return undefined
    }
  }

  // Private methods
  const _addMessage = async (
    content: string,
    role: 'user' | 'assistant'
  ): Promise<Message | undefined> => {
    try {
      if (currentConversationId.value === 0) {
        const newId = await createConversation('New Conversation')
        if (!newId) throw new Error('Failed to create conversation')
      }

      const conversation = await db.conversation.get(currentConversationId.value)
      if (!conversation) {
        const newConversationId = await createConversation('New Conversation')
        if (!newConversationId) throw new Error('Failed to create conversation')
      }

      const messageId = await db.createMessage({
        conversationId: currentConversationId.value,
        role,
        content,
        isStreaming: false,
      })

      const newMessage: Message = {
        id: messageId,
        conversationId: currentConversationId.value,
        role,
        content,
        timestamp: new Date(),
        isStreaming: false,
      }

      messages.value.push(newMessage)

      await db.conversation.update(currentConversationId.value, {
        updatedAt: new Date(),
        messageCount: messages.value.length,
      })

      error.value = undefined
      return newMessage
    } catch (error_) {
      error.value = 'Failed to add message'
      logger.error('Database error:', error_ as Error)
      return undefined
    }
  }

  const _updateMessage = async (messageId: number, content: string): Promise<boolean> => {
    try {
      await db.updateMessage(messageId, content)

      const message = messages.value.find((m) => m.id === messageId)
      if (message) {
        message.content = content
      }

      error.value = undefined
      return true
    } catch (error_) {
      error.value = 'Failed to update message'
      logger.error('Database error:', error_ as Error)
      return false
    }
  }

  // Public addOrUpdate method
  const addOrUpdateMessage = async (
    content: string,
    role: 'user' | 'assistant',
    messageId?: number
  ): Promise<Message | boolean> => {
    if (messageId) {
      return _updateMessage(messageId, content)
    }

    return Boolean(_addMessage(content, role))
  }

  const deleteMessage = async (messageId: number): Promise<boolean> => {
    try {
      await db.deleteMessage(messageId)

      const index = messages.value.findIndex((m) => m.id === messageId)
      if (index !== -1) {
        messages.value.splice(index, 1)
      }

      await db.conversation.update(currentConversationId.value, {
        messageCount: messages.value.length,
        updatedAt: new Date(),
      })

      error.value = undefined
      return true
    } catch (error_) {
      error.value = 'Failed to delete message'
      logger.error('Database error:', error_ as Error)
      return false
    }
  }

  const updateConversationTitle = async (
    conversationId: number,
    title: string
  ): Promise<boolean> => {
    try {
      await db.conversation.update(conversationId, {
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
      logger.error('Database error:', error_ as Error)
      return false
    }
  }

  const generateConversationTitle = (firstMessage: string): string => {
    const title = firstMessage.trim().slice(0, 50)
    return title.length < firstMessage.trim().length ? title + '...' : title
  }

  const deleteConversation = async (conversationId: number): Promise<boolean> => {
    try {
      await db.deleteConversationWithMessage(conversationId)

      if (conversationId === currentConversationId.value) {
        await loadConversations()
        if (conversations.value.length > 0) {
          const highestId = Math.max(...conversations.value.map((c) => c.id))
          currentConversationId.value = highestId
          await loadMessages()
        } else {
          const newConversationId = await createConversation('New Conversation')
          if (newConversationId) {
            currentConversationId.value = newConversationId
            messages.value = []
          }
        }
      } else {
        await loadConversations()
      }

      error.value = undefined
      return true
    } catch (error_) {
      error.value = 'Failed to delete conversation'
      logger.error('Database error:', error_ as Error)
      return false
    }
  }

  const switchConversation = async (conversationId: number): Promise<void> => {
    if (conversationId === currentConversationId.value) return

    currentConversationId.value = conversationId
    await loadMessages()
  }

  // VueUse debounced auto-save
  const debouncedAutoSave = useDebounceFn(
    async (id: number, content: string) => {
      try {
        await db.updateMessage(id, content)
      } catch (error_) {
        logger.error('Auto-save failed:', error_ as Error)
      }
    },
    500,
    { maxWait: 2000 }
  )

  return {
    // State
    messages: readonly(messages),
    conversations: readonly(conversations),
    currentConversationId,
    isLoading: readonly(isLoading),
    error: readonly(error),

    // Actions
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
