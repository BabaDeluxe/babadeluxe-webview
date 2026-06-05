export type Conversation = {
  id: number
  title: string
  createdAt: Date
  updatedAt: Date
  isActive: number
  syncId?: string
  syncVersion?: number
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
  reasoning?: string
  contextReferences?: ContextReference[]
}

export type LocalSetting = {
  id?: number
  settingKey: string
  settingValue: unknown
  dataType: 'string' | 'number' | 'boolean' | 'json-object' | 'json-array'
  updatedAt: Date
}

export type Prompt = {
  id: number
  name: string
  command: string
  description?: string
  template: string
  isSystem: boolean
  isPremium?: boolean
}
