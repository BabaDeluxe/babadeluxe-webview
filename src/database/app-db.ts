import { Dexie, type Table } from 'dexie'
import type { Conversation, Message, LocalSetting } from '@/database/types'
import type { AbstractLogger } from '@/logger'
import { SafeTable } from '@/database/safe-table'
import { ChatRepository } from '@/database/chat-repository'

// Internal DB shape for messages
type DbMessage = {
  id?: number
  conversationId: number
  role: Message['role']
  timestamp: Date
  content: string
  isStreaming?: boolean
  model?: string
  systemPrompt?: string
  contextReferences?: string // Encoded as JSON
}

type NewDbMessage = Omit<DbMessage, 'id' | 'timestamp'>

export class AppDb extends Dexie {
  public conversation!: SafeTable<Conversation, Conversation, number>
  public message!: SafeTable<DbMessage, NewDbMessage, number>
  public localSetting!: SafeTable<LocalSetting, LocalSetting, number>

  private _conversationTable!: Table<Conversation, number>
  private _messageTable!: Table<DbMessage, number>
  private _localSettingTable!: Table<LocalSetting, number>

  private _chatRepository!: ChatRepository

  constructor(private readonly _logger: AbstractLogger) {
    super('AppDb')
    this._declareVersions()
    this._bindTables()
    this._setupHooks()
    this._wrapSafeTables()
    this._chatRepository = new ChatRepository(
      this._conversationTable,
      this._messageTable,
      this.message,
      this.conversation,
      this._logger,
      this.transaction.bind(this)
    )
  }

  /** Business-logic operations on conversations and messages. */
  get chatRepository(): ChatRepository {
    return this._chatRepository
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
      message: '++id, conversationId, role, timestamp, model, systemPrompt, contextReferences',
    })
    this.version(5).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt',
      message:
        '++id, conversationId, role, timestamp, model, systemPrompt, contextReferences, isStreaming',
    })
    this.version(6).stores({
      conversation: '++id, title, isActive, createdAt, updatedAt',
      message:
        '++id, conversationId, role, timestamp, model, systemPrompt, contextReferences, isStreaming',
      localSetting: '++id, settingKey, updatedAt',
    })
  }

  private _bindTables(): void {
    this._conversationTable = this.table<Conversation, number>('conversation')
    this._messageTable = this.table<DbMessage, number>('message')
    this._localSettingTable = this.table<LocalSetting, number>('localSetting')
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

    this._localSettingTable.hook(
      'creating',
      (_primaryKey: number | undefined, myObject: LocalSetting) => {
        if (myObject.updatedAt === undefined) myObject.updatedAt = new Date()
      }
    )
  }

  private _wrapSafeTables(): void {
    this.conversation = new SafeTable<Conversation, Conversation, number>(this._conversationTable)
    this.message = new SafeTable<DbMessage, NewDbMessage, number>(this._messageTable)
    this.localSetting = new SafeTable<LocalSetting, LocalSetting, number>(this._localSettingTable)
  }
}
