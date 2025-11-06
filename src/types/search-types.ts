import type { Conversation, Message } from '@babadeluxe/shared'

export type DbError = { kind: 'DbError'; message: string }
export type StorageError = { kind: 'StorageError'; message: string }
export type ParseError = { kind: 'ParseError'; message: string }
export type SearchError = DbError | StorageError | ParseError

export type SearchResult = (Conversation | Message) & {
  score: number
  highlights: string[]
  resultType: 'conversation' | 'message'
}
