import { Dexie, type Table } from 'dexie'
import { err, ok, type Result, ResultAsync } from 'neverthrow'
import type { Conversation, Message } from '@/database/types'
import type { ConsoleLogger } from '@simwai/utils'
import { DbError } from '@/errors'
import { DexieError, SafeTable } from '@/database/safe-table'

type NewMessage = Omit<Message, 'id' | 'timestamp'> & { timestamp?: Date }

export class AppDb extends Dexie {
  conversation!: SafeTable<Conversation, Conversation, number>
  message!: SafeTable<Message, NewMessage, number>
  private _conversationTable!: Table<Conversation, number>
  private _messageTable!: Table<Message, number>

  constructor(private readonly _logger: ConsoleLogger) {
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
      this._logger.error('Failed to get messages by conversation:', result.error)
      return err(this._toDomainError(result.error))
    }
    return ok(result.value)
  }

  async getMessageCountsByConversation(): Promise<Result<Map<number, number>, DbError>> {
    const result = await ResultAsync.fromPromise(
      (async () => {
        const allMessages = await this._messageTable.toArray()
        const countMap = new Map<number, number>()

        for (const message of allMessages) {
          const currentCount = countMap.get(message.conversationId) ?? 0
          countMap.set(message.conversationId, currentCount + 1)
        }

        return countMap
      })(),
      (error) => {
        this._logger.error(
          'Failed to get message counts:',
          error instanceof Error ? error : new Error(String(error))
        )
        return this._toDomainError(error)
      }
    )

    return result
  }

  async getAllConversations(): Promise<Result<readonly Conversation[], DbError>> {
    const result = await this.conversation.toArray()
    if (result.isErr()) {
      this._logger.error('Failed to get all conversations:', result.error)
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
        this._logger.error(
          'Failed to delete conversation with messages:',
          error instanceof Error ? error : new Error(String(error))
        )
        return this._toDomainError(error)
      }
    )

    return result
  }

  async createMessage(data: Omit<Message, 'id' | 'timestamp'>): Promise<Result<number, DbError>> {
    const resolvedContent =
      typeof data.content === 'string' ? data.content : await Promise.resolve(data.content)

    const conversationResult = await this.conversation.get(data.conversationId)
    if (conversationResult.isErr()) {
      this._logger.error('Failed to verify conversation exists:', conversationResult.error)
      return err(this._toDomainError(conversationResult.error))
    }
    if (conversationResult.value === undefined) {
      const error = new DbError(
        `Cannot create message: Conversation ${data.conversationId} missing`
      )
      this._logger.error('Conversation not found:', error)
      return err(error)
    }

    const result = await ResultAsync.fromPromise(
      this.transaction('rw', this._conversationTable, this._messageTable, async () => {
        const messageData: NewMessage = {
          conversationId: data.conversationId,
          role: data.role,
          content: resolvedContent,
          isStreaming: data.isStreaming ?? false,
          model: data.model,
          systemPrompt: data.systemPrompt,
        }
        const addResult = await this.message.add(messageData)
        if (addResult.isErr()) throw addResult.error
        return addResult.value
      }),
      (error) => {
        this._logger.error(
          'Failed to create message:',
          error instanceof Error ? error : new Error(String(error))
        )
        return this._toDomainError(error)
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
        await this._deleteEmptyConversation(message.conversationId)
      }),
      (error) => {
        this._logger.error(
          'Failed to delete message:',
          error instanceof Error ? error : new Error(String(error))
        )
        return this._toDomainError(error)
      }
    )

    return result
  }

  async updateMessage(id: number, content: string): Promise<Result<number, DbError>> {
    const result = await this.message.update(id, { content, isStreaming: false })
    if (result.isErr()) {
      this._logger.error('Failed to update message:', result.error)
      return err(this._toDomainError(result.error))
    }

    return ok(result.value)
  }

  async getStreamingMessages(): Promise<Result<Message[], DbError>> {
    const allMessagesResult = await this.message.toArray()
    if (allMessagesResult.isErr()) {
      this._logger.error('Failed to get streaming messages:', allMessagesResult.error)
      return err(this._toDomainError(allMessagesResult.error))
    }

    return ok(allMessagesResult.value.filter((message) => message.isStreaming === true))
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
  }

  private _bindTables(): void {
    this._conversationTable = this.table<Conversation, number>('conversation')
    this._messageTable = this.table<Message, number>('message')
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

    this._messageTable.hook('creating', (_primaryKey: number | undefined, myObject: Message) => {
      if (myObject.timestamp === undefined) myObject.timestamp = new Date()
    })
  }

  private _wrapSafeTables(): void {
    this.conversation = new SafeTable<Conversation, Conversation, number>(this._conversationTable)
    this.message = new SafeTable<Message, NewMessage, number>(this._messageTable)
  }

  private async _deleteEmptyConversation(conversationId: number): Promise<void> {
    const count = await this._messageTable.where('conversationId').equals(conversationId).count()
    if (count !== 0) return

    await this._conversationTable.delete(conversationId)
    this._logger.log(`Cascade deleted empty conversation ${conversationId}`)
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
