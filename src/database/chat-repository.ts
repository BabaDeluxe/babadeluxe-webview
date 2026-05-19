import { ok, err, type Result } from 'neverthrow'
import type { Table, TransactionMode } from 'dexie'
import type { Conversation, Message, ContextReference } from '@/database/types'
import type { SafeTable } from '@/database/safe-table'
import { DbError, ChatError } from '@/errors'
import type { AbstractLogger } from '@/logger'
import { encodeContextReferences, decodeContextReferences } from '@/database/serializers'

type DbMessage = {
  id?: number
  conversationId: number
  role: Message['role']
  timestamp: Date
  content: string
  isStreaming?: boolean
  model?: string
  systemPrompt?: string
  contextReferences?: string
}

type NewDbMessage = Omit<DbMessage, 'id' | 'timestamp'>

type TransactionFn = (
  mode: TransactionMode,
  conversationTable: Table<Conversation, number>,
  messageTable: Table<DbMessage, number>,
  scope: () => Promise<void>
) => Promise<unknown>

type CreateMessageInput = {
  conversationId: number
  role: Message['role']
  content: string
  isStreaming?: boolean
  model?: string
  systemPrompt?: string
  contextReferences?: ContextReference[]
}

export class ChatRepository {
  constructor(
    private readonly _conversationTable: Table<Conversation, number>,
    private readonly _messageTable: Table<DbMessage, number>,
    private readonly _message: SafeTable<DbMessage, NewDbMessage, number>,
    private readonly _conversation: SafeTable<Conversation, Conversation, number>,
    private readonly _logger: AbstractLogger,
    private readonly _transaction: TransactionFn
  ) {}

  async getAllConversations(): Promise<Result<Conversation[], DbError>> {
    const result = await this._conversation.toArray()
    if (result.isErr()) return err(result.error)

    const sorted = [...result.value].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    return ok(sorted)
  }

  async getMessagesByConversation(conversationId: number): Promise<Result<Message[], DbError>> {
    const result = await this._message.where('conversationId').equals(conversationId).toArray()
    if (result.isErr()) return err(result.error)

    const mapped: Message[] = result.value
      .map((message) => ({
        id: message.id!,
        conversationId: message.conversationId,
        role: message.role,
        timestamp: message.timestamp,
        content: message.content,
        isStreaming: message.isStreaming,
        model: message.model,
        systemPrompt: message.systemPrompt,
        contextReferences: decodeContextReferences(message.contextReferences),
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return ok(mapped)
  }

  async getMessageCountsByConversation(): Promise<Result<Map<number, number>, DbError>> {
    const result = await this._message.toArray()
    if (result.isErr()) return err(result.error)

    const counts = new Map<number, number>()
    for (const message of result.value) {
      counts.set(message.conversationId, (counts.get(message.conversationId) ?? 0) + 1)
    }

    return ok(counts)
  }

  async getStreamingMessages(): Promise<Result<Message[], DbError>> {
    const result = await this._message.toArray()
    if (result.isErr()) return err(result.error)

    const mapped: Message[] = result.value
      .filter((message) => message.isStreaming === true)
      .map((message) => ({
        id: message.id!,
        conversationId: message.conversationId,
        role: message.role,
        timestamp: message.timestamp,
        content: message.content,
        isStreaming: message.isStreaming,
        model: message.model,
        systemPrompt: message.systemPrompt,
        contextReferences: decodeContextReferences(message.contextReferences),
      }))

    return ok(mapped)
  }

  async createMessage(input: CreateMessageInput): Promise<Result<number, DbError>> {
    const addResult = await this._message.add({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      isStreaming: input.isStreaming ?? false,
      model: input.model,
      systemPrompt: input.systemPrompt,
      contextReferences: encodeContextReferences(input.contextReferences),
    })

    if (addResult.isErr()) return err(addResult.error)

    const updateConversationResult = await this._conversation.update(input.conversationId, {
      updatedAt: new Date(),
    })

    if (updateConversationResult.isErr()) {
      this._logger.error('Failed to update conversation timestamp after message creation', {
        conversationId: input.conversationId,
        error: updateConversationResult.error,
      })
    }

    return ok(Number(addResult.value))
  }

  async updateMessage(messageId: number, content: string): Promise<Result<void, DbError>> {
    const getResult = await this._message.get(messageId)
    if (getResult.isErr()) return err(getResult.error)

    const existing = getResult.value
    if (!existing) return err(new DbError(`Message ${messageId} not found`))

    const updateResult = await this._message.update(messageId, { content })
    if (updateResult.isErr()) return err(updateResult.error)

    const conversationUpdateResult = await this._conversation.update(existing.conversationId, {
      updatedAt: new Date(),
    })

    if (conversationUpdateResult.isErr()) {
      this._logger.error('Failed to update conversation timestamp after message update', {
        messageId,
        error: conversationUpdateResult.error,
      })
    }

    return ok(undefined)
  }

  async deleteMessage(messageId: number): Promise<Result<void, DbError | ChatError>> {
    const getResult = await this._message.get(messageId)
    if (getResult.isErr()) return err(getResult.error)

    const existing = getResult.value
    if (!existing) return err(new ChatError(`Message ${messageId} not found`))

    const deleteResult = await this._message.delete(messageId)
    if (deleteResult.isErr()) return err(deleteResult.error)

    const conversationUpdateResult = await this._conversation.update(existing.conversationId, {
      updatedAt: new Date(),
    })

    if (conversationUpdateResult.isErr()) {
      this._logger.error('Failed to update conversation timestamp after message deletion', {
        messageId,
        error: conversationUpdateResult.error,
      })
    }

    return ok(undefined)
  }

  async deleteConversationWithMessage(
    conversationId: number
  ): Promise<Result<void, DbError | ChatError>> {
    try {
      await this._transaction('rw', this._conversationTable, this._messageTable, async () => {
        await this._messageTable.where('conversationId').equals(conversationId).delete()
        await this._conversationTable.delete(conversationId)
      })

      return ok(undefined)
    } catch (unknownError) {
      return err(
        new DbError(`Failed to delete conversation ${conversationId} with messages`, unknownError)
      )
    }
  }
}
