import { ref, type Ref } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import type { Message, ContextReference } from '@/database/types'
import type { AppDb } from '@/database/app-db'
import type { DbError } from '@/errors'
import { ChatError, MessageNotFoundError } from '@/errors'
import { decodeContextReferences } from '@/database/serializers'

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

  return {
    loadMessages,
    refreshMessageById,
    updateMessageContent,
    deleteMessage,
  }
}
