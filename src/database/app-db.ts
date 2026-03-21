import { Dexie, type Table } from 'dexie'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Conversation, Message, ContextReference } from '@/database/types'
import type { AbstractLogger } from '@/logger'
import { DbError } from '@/errors'
import { DexieError, SafeTable } from '@/database/safe-table'
import { encodeContextReferences, decodeContextReferences } from '@/database/serializers'

// What actually lives in IndexedDB
type DbMessage = {
  id?: number
  conversationId: number
  role: 'user' | 'assistant'
  timestamp: Date
  content: string
  isStreaming?: boolean
  model?: string
  systemPrompt?: string
  // JSON stringified
  contextReferences?: string
}

type NewDbMessage = Omit<DbMessage, 'id' | 'timestamp'>

export class AppDb extends Dexie {
  conversation!: SafeTable<Conversation, Conversation, number>
  message!: SafeTable<DbMessage, NewDbMessage, number>
  private _conversationTable!: Table<Conversation, number>
  private _messageTable!: Table<DbMessage, number>

  constructor(private readonly _logger: AbstractLogger) {
    super('AppDb')
    this._declareVersions()
    this._bindTables()
    this._setupHooks()
    this._wrapSafeTables()
  }

  async getMessageByConversation(
    conversationId: number
  ): Promise<Result<readonly Message[], DbError>> {
    const result = await this.message.where('conversationId').equals(conversationId).sortBy('id')
    if (result.isErr()) {
      this._logger.error('Failed to get messages by conversation', {
        conversationId,
        error: result.error,
      })
      return err(this._toDomainError(result.error))
    }

    const mapped: Message[] = result.value.map((message) => ({
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

  async getMessageCountsByConversation(): Promise<Result<Map<number, number>, DbError>> {
    const result = await ResultAsync.fromPromise(
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
        this._logger.error('Failed to get message counts', {
          error: mappedError,
        })
        return mappedError
      }
    )

    return result
  }

  async getAllConversations(): Promise<Result<readonly Conversation[], DbError>> {
    const result = await this.conversation.toArray()
    if (result.isErr()) {
      this._logger.error('Failed to get all conversations', {
        error: result.error,
      })
      return err(this._toDomainError(result.error))
    }

    return ok(result.value)
  }

  async deleteConversationWithMessage(conversationId: number): Promise<Result<void, DbError>> {
    const result = await ResultAsync.fromPromise(
      this.transaction('rw', this._conversationTable, this._messageTable, async () => {
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

    return result
  }

  async createMessage(data: Omit<Message, 'id' | 'timestamp'>): Promise<Result<number, DbError>> {
    const resolvedContent = data.content

    const conversationResult = await this.conversation.get(data.conversationId)
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

    const result = await ResultAsync.fromPromise(
      this.transaction('rw', this._conversationTable, this._messageTable, async () => {
        const messageData: NewDbMessage = {
          conversationId: data.conversationId,
          role: data.role,
          content: resolvedContent,
          isStreaming: data.isStreaming ?? false,
          model: data.model,
          systemPrompt: data.systemPrompt,
          contextReferences: encodeContextReferences(data.contextReferences),
        }
        const addResult = await this.message.add(messageData)
        if (addResult.isErr()) throw addResult.error
        return addResult.value
      }),
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

    return result
  }

  async deleteMessage(id: number): Promise<Result<void, DbError>> {
    const result = await ResultAsync.fromPromise(
      this.transaction('rw', this._conversationTable, this._messageTable, async () => {
        const message = await this._messageTable.get(id)
        if (!message) return

        await this._messageTable.delete(id)

        const cascadeResult = await this._deleteEmptyConversation(message.conversationId)
        if (cascadeResult.isErr()) throw cascadeResult.error
      }),
      (error) => {
        const mappedError = this._toDomainError(error)
        this._logger.error('Failed to delete message', {
          messageId: id,
          error: mappedError,
        })
        return mappedError
      }
    )

    return result
  }

  async updateMessage(id: number, content: string): Promise<Result<number, DbError>> {
    const result = await this.message.update(id, { content, isStreaming: false })
    if (result.isErr()) {
      this._logger.error('Failed to update message', {
        messageId: id,
        error: result.error,
      })
      return err(this._toDomainError(result.error))
    }

    return ok(result.value)
  }

  async updateMessageContextReferences(
    id: number,
    refs: ContextReference[] | undefined
  ): Promise<Result<number, DbError>> {
    const result = await this.message.update(id, {
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
    const messagesResult = await this.message.where('isStreaming').equals('true').toArray()

    if (messagesResult.isErr()) {
      this._logger.error('Failed to get streaming messages', {
        error: messagesResult.error,
      })
      return err(this._toDomainError(messagesResult.error))
    }

    const mapped: Message[] = messagesResult.value.map((message) => ({
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

  private _declareVersions(): void {
    this.version(1).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt, messageCount',
      message: '++id, conversationId, role, timestamp',
    })
    this.version(2).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt, messageCount',
      message: '++id, conversationId, role, timestamp, model',
    })
    this.version(3).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt',
      message: '++id, conversationId, role, timestamp, model',
    })
    this.version(4).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt',
      // schema string stays the same; we just treat contextReferences as string in DbMessage
      message: '++id, conversationId, role, timestamp, model, systemPrompt, contextReferences',
    })
    this.version(5).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt',
      message:
        '++id, conversationId, role, timestamp, model, systemPrompt, contextReferences, isStreaming',
    })
  }

  private _bindTables(): void {
    this._conversationTable = this.table<Conversation, number>('conversation')
    this._messageTable = this.table<DbMessage, number>('message')
  }

  private _setupHooks(): void {
    this._conversationTable.hook(
      'creating',
      (_primaryKey: number | undefined, myObject: Conversation) => {
        const now = new Date()
        myObject.createdAt = now
        myObject.updatedAt = now
        myObject.isActive = 1
      }
    )

    this._conversationTable.hook('updating', () => ({ updatedAt: new Date() }))

    this._messageTable.hook('creating', (_primaryKey: number | undefined, myObject: DbMessage) => {
      if (myObject.timestamp === undefined) myObject.timestamp = new Date()
    })
  }

  private _wrapSafeTables(): void {
    this.conversation = new SafeTable<Conversation, Conversation, number>(this._conversationTable)
    this.message = new SafeTable<DbMessage, NewDbMessage, number>(this._messageTable)
  }

  private async _deleteEmptyConversation(conversationId: number): Promise<Result<void, DbError>> {
    return ResultAsync.fromPromise(
      (async () => {
        const count = await this._messageTable
          .where('conversationId')
          .equals(conversationId)
          .count()
        if (count !== 0) return

        await this._conversationTable.delete(conversationId)
        this._logger.log(`Cascade deleted empty conversation ${conversationId}`)
      })(),
      (error) => {
        const mappedError = this._toDomainError(error)
        this._logger.error('Failed to cascade delete conversation', {
          conversationId,
          error: mappedError,
        })
        return mappedError
      }
    )
  }

  private _toDomainError(error: unknown): DbError {
    if (error instanceof DexieError) {
      return new DbError(
        `Database operation '${error.operation}' failed on table '${error.tableName}'`,
        error
      )
    }

    return new DbError(
      error instanceof Error ? error.message : 'An unknown DB error occurred',
      error instanceof Error ? error : undefined
    )
  }
}
