import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Conversation, Message, ContextReference } from '@/database/types'
import type { AbstractLogger } from '@/logger'
import { DbError } from '@/errors'
import type { SafeTable } from '@/database/safe-table'
import type { Table, Dexie } from 'dexie'
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

// Extract the exact transaction method type from Dexie to satisfy TS
type TransactionMethod = Dexie['transaction']

export class ChatRepository {
  constructor(
    private readonly _conversationTable: Table<Conversation, number>,
    private readonly _messageTable: Table<DbMessage, number>,
    private readonly _safeMessage: SafeTable<DbMessage, NewDbMessage, number>,
    private readonly _safeConversation: SafeTable<Conversation, Conversation, number>,
    private readonly _logger: AbstractLogger,
    // Safely inject the bounded transaction method without inline imports
    private readonly _transaction: TransactionMethod
  ) {}

  async getMessageByConversation(
    conversationId: number
  ): Promise<Result<readonly Message[], DbError>> {
    const result = await this._safeMessage
      .where('conversationId')
      .equals(conversationId)
      .sortBy('id')

    if (result.isErr()) {
      this._logger.error('Failed to get messages by conversation', {
        conversationId,
        error: result.error,
      })
      return err(this._toDomainError(result.error))
    }

    const mapped: Message[] = result.value.map((message) => ({
      id: message.id ?? 0,
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

  async getMessageCountsByConversation(): Promise<Result<Map<number, number>, DbError>> {
    return ResultAsync.fromPromise(
      (async () => {
        const countMap = new Map<number, number>()
        const allConversations = await this._conversationTable.toArray()

        for (const conversation of allConversations) {
          if (conversation.id) {
            const count = await this._messageTable
              .where('conversationId')
              .equals(conversation.id)
              .count()
            countMap.set(conversation.id, count)
          }
        }

        return countMap
      })(),
      (error) => {
        const mappedError = this._toDomainError(error)
        this._logger.error('Failed to get message counts', { error: mappedError })
        return mappedError
      }
    )
  }

  async deleteConversationWithMessage(conversationId: number): Promise<Result<void, DbError>> {
    return ResultAsync.fromPromise(
      this._transaction('rw', this._conversationTable, this._messageTable, async () => {
        await this._messageTable.where('conversationId').equals(conversationId).delete()
        await this._conversationTable.delete(conversationId)
      }),
      (error) => {
        const mappedError = this._toDomainError(error)
        this._logger.error('Failed to delete conversation with messages', {
          conversationId,
          error: mappedError,
        })
        return mappedError
      }
    )
  }

  async createMessage(data: Omit<Message, 'id' | 'timestamp'>): Promise<Result<number, DbError>> {
    const conversationResult = await this._safeConversation.get(data.conversationId)
    if (conversationResult.isErr()) {
      this._logger.error('Failed to verify conversation exists', {
        conversationId: data.conversationId,
        error: conversationResult.error,
      })
      return err(this._toDomainError(conversationResult.error))
    }
    if (conversationResult.value === undefined) {
      const error = new DbError(
        `Cannot create message: Conversation ${data.conversationId} missing`
      )
      this._logger.error('Conversation not found when creating message', {
        conversationId: data.conversationId,
        error,
      })
      return err(error)
    }

    return ResultAsync.fromPromise(
      this._transaction('rw', this._conversationTable, this._messageTable, async () => {
        const messageData: NewDbMessage = {
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          isStreaming: data.isStreaming ?? false,
          model: data.model,
          systemPrompt: data.systemPrompt,
          contextReferences: encodeContextReferences(data.contextReferences),
        }
        // We use the raw table so Dexie natively throws and rolls back the transaction on failure
        return await this._messageTable.add(messageData as DbMessage)
      }) as Promise<number>,
      (error) => {
        const mappedError = this._toDomainError(error)
        this._logger.error('Failed to create message', {
          conversationId: data.conversationId,
          role: data.role,
          error: mappedError,
        })
        return mappedError
      }
    )
  }

  async deleteMessage(id: number): Promise<Result<void, DbError>> {
    return ResultAsync.fromPromise(
      this._transaction('rw', this._conversationTable, this._messageTable, async () => {
        const message = await this._messageTable.get(id)
        if (!message) return

        await this._messageTable.delete(id)

        const count = await this._messageTable
          .where('conversationId')
          .equals(message.conversationId)
          .count()

        if (count === 0) {
          await this._conversationTable.delete(message.conversationId)
          this._logger.log(`Cascade deleted empty conversation ${message.conversationId}`)
        }
      }),
      (error) => {
        const mappedError = this._toDomainError(error)
        this._logger.error('Failed to delete message', { messageId: id, error: mappedError })
        return mappedError
      }
    )
  }

  async updateMessage(id: number, content: string): Promise<Result<number, DbError>> {
    const result = await this._safeMessage.update(id, { content, isStreaming: false })
    if (result.isErr()) {
      this._logger.error('Failed to update message', { messageId: id, error: result.error })
      return err(this._toDomainError(result.error))
    }
    return ok(result.value)
  }

  async updateMessageContextReferences(
    id: number,
    refs: ContextReference[] | undefined
  ): Promise<Result<number, DbError>> {
    const result = await this._safeMessage.update(id, {
      contextReferences: encodeContextReferences(refs),
    })
    if (result.isErr()) {
      this._logger.error('Failed to update message contextReferences', {
        messageId: id,
        error: result.error,
      })
      return err(this._toDomainError(result.error))
    }
    return ok(result.value)
  }

  async getStreamingMessages(): Promise<Result<Message[], DbError>> {
    const messagesResult = await this._safeMessage.where('isStreaming').equals('true').toArray()

    if (messagesResult.isErr()) {
      this._logger.error('Failed to get streaming messages', { error: messagesResult.error })
      return err(this._toDomainError(messagesResult.error))
    }

    const mapped: Message[] = messagesResult.value.map((message) => ({
      id: message.id ?? 0,
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

  private _toDomainError(error: unknown): DbError {
    return new DbError(
      error instanceof Error ? error.message : 'An unknown DB error occurred',
      error instanceof Error ? error : undefined
    )
  }
}
