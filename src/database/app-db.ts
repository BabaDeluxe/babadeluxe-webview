/* eslint-disable @typescript-eslint/no-unused-vars */
import Dexie, { type EntityTable } from 'dexie'
import type { Conversation, Message } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import { ResultAsync, type Result } from 'neverthrow'

type DbError = { readonly code: string; readonly message: string }

const toDbError = (error: unknown): DbError => ({
  code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
  message: error instanceof Error ? error.message : String(error),
})

export class AppDb extends Dexie {
  conversation!: EntityTable<Conversation, 'id'>
  message!: EntityTable<Message, 'id'>

  constructor(private readonly _logger: ConsoleLogger) {
    super('AppDb')

    this.version(1).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt, messageCount',
      message: '++id, conversationId, role, timestamp',
    })

    this.conversation.hook('creating', (_, myObject) => {
      const now = new Date()
      myObject.createdAt = now
      myObject.updatedAt = now
      myObject.isActive = 1
    })

    this.conversation.hook('updating', async function (_, __, ___, transaction) {
      return { updatedAt: new Date() }
    })

    this.message.hook('creating', function (_, myObject) {
      myObject.timestamp = new Date()
    })

    this.message.hook('deleting', async function (_, myObject, transaction) {
      if (!myObject?.conversationId) {
        throw new Error('Cannot delete message: conversationId is undefined')
      }

      const conversationId = myObject.conversationId
      this.onsuccess = async () => {
        const messageCount = await transaction
          .table('message')
          .where('conversationId')
          .equals(conversationId)
          .count()

        if (messageCount === 0) {
          await transaction.table('conversation').delete(conversationId)
        }
      }
    })
  }

  async getMessageByConversation(
    conversationId: number
  ): Promise<Result<readonly Message[], DbError>> {
    return ResultAsync.fromPromise(
      this.message.where('conversationId').equals(conversationId).toArray(),
      toDbError
    )
  }

  async getAllConversations(): Promise<Result<readonly Conversation[], DbError>> {
    return ResultAsync.fromPromise(this.conversation.toArray(), toDbError)
  }

  async deleteConversationWithMessage(conversationId: number): Promise<Result<void, DbError>> {
    return ResultAsync.fromPromise(
      this.transaction('rw', this.conversation, this.message, async () => {
        const messageCount = await this.message
          .where('conversationId')
          .equals(conversationId)
          .count()
        if (messageCount > 0) {
          await this.message.where('conversationId').equals(conversationId).delete()
        }
        await this.conversation.delete(conversationId)
      }),
      toDbError
    )
  }

  async createMessage(data: Omit<Message, 'id' | 'timestamp'>): Promise<Result<number, DbError>> {
    return ResultAsync.fromPromise(
      (async () => {
        const resolvedContent =
          typeof data.content === 'string' ? data.content : await Promise.resolve(data.content)

        return this.transaction('rw', this.conversation, this.message, async () => {
          const conversation = await this.conversation.get(data.conversationId)
          if (!conversation) {
            throw new Error(`Cannot create message: Conversation ${data.conversationId} missing`)
          }

          const messageData = {
            conversationId: data.conversationId,
            role: data.role,
            content: resolvedContent,
            timestamp: new Date(),
            isStreaming: data.isStreaming ?? false,
          }

          const generatedId = await this.message.add(messageData)
          return Number(generatedId)
        })
      })(),
      toDbError
    )
  }

  async updateMessage(id: number, content: string): Promise<Result<number, DbError>> {
    return ResultAsync.fromPromise(this.message.update(id, { content }), toDbError)
  }

  async deleteMessage(id: number): Promise<Result<void, DbError>> {
    return ResultAsync.fromPromise(this.message.delete(id), toDbError)
  }
}
