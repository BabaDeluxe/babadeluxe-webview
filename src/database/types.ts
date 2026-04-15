export type Conversation = {
  id: number
  title: string
  createdAt: Date
  updatedAt?: Date
  isActive: number
}

export type KeyValuePair = {
  key: string
  value: string
  updatedAt: Date
}

export type ContextReference =
  | Readonly<{
      type: 'file'
      filePath: string
    }>
  | Readonly<{
      type: 'snippet'
      snippetText: string
      filePath?: string
    }>

export type Message = {
  readonly id: number
  readonly conversationId: number
  readonly role: 'user' | 'assistant'
  timestamp: Date
  content: string
  isStreaming?: boolean
  model?: string
  systemPrompt?: string
  contextReferences?: ContextReference[]
}

export type LocalSetting = {
  id?: number
  settingKey: string
  settingValue: unknown
  dataType: 'string' | 'number' | 'boolean'
  updatedAt: Date
}
