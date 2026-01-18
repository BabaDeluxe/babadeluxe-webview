import type { Conversation, Message } from '@/database/types'

export type SearchResult = (Conversation | Message) & {
  score: number
  highlights: string[]
  resultType: 'conversation' | 'message'
}

interface MessageSearchResult extends Message {
  score: number
  highlights: string[]
  resultType: 'message'
}

interface ConversationSearchResult extends Conversation {
  score: number
  highlights: string[]
  resultType: 'conversation'
}

export function isMessageResult(result: SearchResult): result is MessageSearchResult {
  return (
    result.resultType === 'message' &&
    'conversationId' in result &&
    'content' in result &&
    typeof result.id === 'number'
  )
}

export function isConversationResult(result: SearchResult): result is ConversationSearchResult {
  return result.resultType === 'conversation' && 'title' in result && typeof result.id === 'number'
}
