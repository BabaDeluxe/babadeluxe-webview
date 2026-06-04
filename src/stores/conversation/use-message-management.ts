import { type Ref } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import type { Message } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import type { DbError } from '@/errors'
import { ChatError, MessageNotFoundError } from '@/errors'
import { decodeContextReferences } from '@/database/serializers'

type MessageMetadata = {
  model?: string
  systemPrompt?: string
}

export function useMessageManagement(
  appDb: AppDb,
  messages: Ref<Message[]>,
  messageCountsByConversation: Ref<Map<number, number>>
) {
  async function loadMessages(conversationId: number): Promise<Result<void, DbError>> {
    if (!conversationId) {
      messages.value = []
      return ok(undefined)
    }

    const result = await appDb.chatRepository.getMessagesByConversation(conversationId)
    if (result.isErr()) {
      messages.value = []
      return err(result.error)
    }

    messages.value = [...result.value]
    return ok(undefined)
  }

  async function refreshMessageById(messageId: number): Promise<Result<void, DbError | ChatError>> {
    const result = await appDb.message.get(messageId)
    if (result.isErr()) return err(result.error)

    const updatedDb = result.value
    if (!updatedDb) return err(new MessageNotFoundError(messageId.toString()))

    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return err(new ChatError(`Message ${messageId} not found locally`))

    messages.value[index] = {
      id: updatedDb.id ?? 0,
      conversationId: updatedDb.conversationId,
      role: updatedDb.role,
      timestamp: updatedDb.timestamp,
      content: updatedDb.content,
      isStreaming: updatedDb.isStreaming,
      model: updatedDb.model,
      systemPrompt: updatedDb.systemPrompt,
      contextReferences: decodeContextReferences(updatedDb.contextReferences),
    }

    return ok(undefined)
  }

  async function updateMessageContent(
    messageId: number,
    content: string
  ): Promise<Result<void, DbError>> {
    const result = await appDb.chatRepository.updateMessage(messageId, content)
    if (result.isErr()) return err(result.error)

    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      messages.value[index].content = content
    }

    return ok(undefined)
  }

  async function deleteMessage(messageId: number): Promise<Result<void, DbError | ChatError>> {
    const result = await appDb.chatRepository.deleteMessage(messageId)
    if (result.isErr()) return err(result.error)

    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      const deleted = messages.value[index]
      messages.value.splice(index, 1)

      const count = messageCountsByConversation.value.get(deleted.conversationId) ?? 0
      if (count > 0) messageCountsByConversation.value.set(deleted.conversationId, count - 1)
    }

    return ok(undefined)
  }

  async function createUserMessage(
    conversationId: number,
    content: string,
    metadata?: MessageMetadata,
    contextReferences?: ContextReference[]
  ): Promise<Result<Message, ChatError | DbError>> {
    const createResult = await appDb.chatRepository.createMessage({
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

  async function updateUserMessage(
    messageId: number,
    newContent: string
  ): Promise<Result<void, MessageNotFoundError | ChatError | DbError>> {
    const message = messages.value.find((m) => m.id === messageId)
    if (!message) return err(new MessageNotFoundError(messageId.toString()))

    if (message.role !== 'user') {
      return err(new ChatError('updateUserMessage can only update user messages'))
    }

    return updateMessageContent(messageId, newContent)
  }

  async function finalizeAssistantMessage(
    messageId: number,
    fullContent: string
  ): Promise<Result<void, DbError | ChatError>> {
    const updateResult = await appDb.message.update(messageId, {
      content: fullContent,
      isStreaming: false,
    })

    if (updateResult.isErr()) return err(updateResult.error)

    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      const current = messages.value[index]
      messages.value[index] = {
        ...current,
        content: fullContent,
        isStreaming: false,
      }
    }

    return ok(undefined)
  }

  return {
    loadMessages,
    refreshMessageById,
    updateMessageContent,
    deleteMessage,
    createUserMessage,
    updateUserMessage,
    finalizeAssistantMessage,
  }
}
