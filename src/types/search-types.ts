import type { Conversation, Message } from '@babadeluxe/shared'

export type SearchResult = (Conversation | Message) & {
  score: number
  highlights: string[]
  resultType: 'conversation' | 'message'
}
