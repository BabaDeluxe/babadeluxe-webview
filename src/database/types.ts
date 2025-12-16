export type Conversation = {
  id: number
  title: string
  createdAt: Date
  updatedAt?: Date
  messageCount: number
  isActive: number
}

export type KeyValuePair = {
  key: string
  value: string
  updatedAt: Date
}

export type Message = {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

export type Prompt = {
  id: number
  title: string
  content: string
  category?: string
  createdAt: Date
  updatedAt?: Date
}
