import Dexie, { type Table } from 'dexie'
import { type Conversation, type Message } from '@babadeluxe/shared'

export class AppDb extends Dexie {
  conversation!: Table<Conversation>
  message!: Table<Message>

  constructor() {
    super('AppDb')

    this.version(1).stores({
      conversation: '++id, title, createdAt, updatedAt, messageCount',
      message: '++id, conversationId, role, timestamp',
    })

    this.conversation.hook('creating', (_, object) => {
      object.createdAt = new Date()
      object.updatedAt = new Date()
    })

    this.conversation.hook('updating', () => {
      return { updatedAt: new Date() }
    })

    this.message.hook('creating', async (_primKey, object, trans) => {
      object.timestamp = new Date()

      const conversation: unknown = await trans.table('conversation').get(object.conversationId)
      if (!conversation) {
        throw new Error(
          `Cannot create message: Conversation with id ${object.conversationId} does not exist`
        )
      }
    })

    this.conversation.hook('deleting', async (primKey, _object, trans) => {
      const messageCount = await trans
        .table('message')
        .where('conversationId')
        .equals(primKey)
        .count()
      if (messageCount > 0) {
        throw new Error(
          `Cannot delete conversation: ${messageCount} messages depend on this conversation`
        )
      }
    })
  }

  async getMessageByConversation(conversationId: number): Promise<Message[]> {
    return this.message.where('conversationId').equals(conversationId).toArray()
  }

  async deleteConversationWithMessage(conversationId: number): Promise<void> {
    return this.transaction('rw', this.conversation, this.message, async () => {
      await this.message.where('conversationId').equals(conversationId).delete()
      await this.conversation.delete(conversationId)
    })
  }

  async createMessage(message: Omit<Message, 'id' | 'timestamp'>): Promise<number> {
    const conversation = await this.conversation.get(message.conversationId)
    if (!conversation) {
      throw new Error(
        `Cannot create message: Conversation with id ${message.conversationId} does not exist`
      )
    }

    const messageAddResult = this.message.add(message as Message)
    const finalResult = Number(messageAddResult)
    return finalResult
  }

  async updateMessage(id: number, content: string): Promise<number> {
    return this.message.update(id, { content })
  }

  async deleteMessage(id: number): Promise<void> {
    await this.message.delete(id)
  }
}

export const db = new AppDb()
