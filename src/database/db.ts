import Dexie, { type EntityTable } from 'dexie'
import type { Conversation, Message } from '@babadeluxe/shared'

export class AppDb extends Dexie {
  conversation!: EntityTable<Conversation, 'id'>
  message!: EntityTable<Message, 'id'>

  constructor() {
    super('AppDb')

    // Keep version 1 for existing installations
    this.version(1).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt, messageCount',
      message: '++id, conversationId, role, timestamp',
    })

    this.conversation.hook('creating', (_pk, object) => {
      const now = new Date()
      object.createdAt = now
      object.updatedAt = now
      object.isActive = 1
    })

    this.conversation.hook('updating', () => ({ updatedAt: new Date() }))
    this.message.hook('creating', (_pk, object) => {
      object.timestamp = new Date()
    })
  }

  async getActiveConversations() {
    await this._ready()
    return this.conversation.where('isActive').equals(1).sortBy('updatedAt')
  }

  async getArchivedConversations() {
    await this._ready()
    return this.conversation.where('isActive').equals(0).sortBy('updatedAt')
  }

  async archiveConversation(conversationId: number) {
    await this._ready()
    return this.conversation.update(conversationId, {
      isActive: 1,
      updatedAt: new Date(),
    })
  }

  async getMessageByConversation(conversationId: number) {
    await this._ready()
    return this.message.where('conversationId').equals(conversationId).toArray()
  }

  async deleteConversationWithMessage(conversationId: number) {
    await this._ready()
    return this.transaction('rw', this.conversation, this.message, async () => {
      const messageCount = await this.message.where('conversationId').equals(conversationId).count()
      if (messageCount > 0) {
        await this.message.where('conversationId').equals(conversationId).delete()
      }

      await this.conversation.delete(conversationId)
    })
  }

  async createMessage(data: Omit<Message, 'id' | 'timestamp'>) {
    await this._ready()

    const resolvedContent =
      typeof data.content === 'string' ? data.content : await Promise.resolve(data.content)

    // ❂ Move validation here where we control the transaction scope
    return this.transaction('rw', this.conversation, this.message, async () => {
      const conversation = await this.conversation.get(data.conversationId)
      if (!conversation) {
        throw new Error(`Cannot create message: Conversation ${data.conversationId} missing`)
      }

      // ❸ EntityTable automatically handles the type-safe omission of 'id' and 'timestamp'
      const messageData = {
        conversationId: data.conversationId,
        role: data.role,
        content: resolvedContent,
        timestamp: new Date(), // Will be overwritten by hook
        isStreaming: data.isStreaming ?? false,
      }

      // ❹ Add returns the generated ID - EntityTable handles this properly
      const generatedId = await this.message.add(messageData)
      return Number(generatedId)
    })
  }

  async updateMessage(id: number, content: string) {
    await this._ready()
    return this.message.update(id, { content })
  }

  async deleteMessage(id: number) {
    await this._ready()
    await this.message.delete(id)
  }

  async resetDatabase(): Promise<void> {
    await this.delete()
    await this.open()
  }

  private async _ready() {
    if (this.isOpen()) {
      return
    }

    await this.open()
  }
}

export const db = new AppDb()
