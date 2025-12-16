import type { Conversation, Message } from '@/database/types'

export type SearchResult = (Conversation | Message) & {
  score: number
  highlights: string[]
  resultType: 'conversation' | 'message'
}
