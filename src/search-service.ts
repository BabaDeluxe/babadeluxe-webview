import { ok, err, type Result } from 'neverthrow'
import type { Conversation, Message } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import { damerauLevenshteinSimilarity } from '@/damerau-levenshtein-similarity'
import { type AppDb } from '@/database/app-db'
import type { SearchResult } from '@/types/search-types'
import { type DbError, SearchError } from '@/errors'

export class SearchService {
  constructor(
    private readonly _db: AppDb,
    private readonly _logger: ConsoleLogger
  ) {}

  async search(query: string, limit = 10): Promise<Result<SearchResult[], SearchError>> {
    const conversationsResult = await this._db.getAllConversations()
    if (conversationsResult.isErr()) {
      this._logger.error('DB query to get get all conversatios failed', conversationsResult.error)
      return err(conversationsResult.error)
    }

    const allMessagesResult = await this._getAllMessages(conversationsResult.value)
    if (allMessagesResult.isErr())
      return err(new SearchError('Failed to get all messages for search', allMessagesResult.error))

    const searchResult = this._performSearch(
      query,
      [...conversationsResult.value],
      allMessagesResult.value,
      limit
    )

    return searchResult
  }

  private async _getAllMessages(
    conversations: readonly Conversation[]
  ): Promise<Result<Message[], DbError>> {
    const allMessages: Message[] = []

    for (const conversation of conversations) {
      const messagesResult = await this._db.getMessageByConversation(conversation.id)
      if (messagesResult.isErr()) {
        this._logger.error(
          `Failed to get message for conversation with conversation ID ${conversation.id}`,
          messagesResult.error
        )
        return err(messagesResult.error)
      }
      allMessages.push(...messagesResult.value)
    }

    return ok(allMessages)
  }

  private _performSearch(
    query: string,
    conversations: Conversation[],
    messages: Message[],
    limit: number
  ): Result<SearchResult[], never> {
    const results: SearchResult[] = []
    const normalizedQuery = query.toLowerCase()

    for (const conversation of conversations) {
      const score = this._getBestTokenScore(normalizedQuery, conversation.title)

      if (score > 0.3) {
        results.push({
          ...conversation,
          score,
          highlights: [conversation.title],
          resultType: 'conversation',
        })
      }
    }

    for (const message of messages) {
      const score = this._getBestTokenScore(normalizedQuery, message.content)

      if (score > 0.3) {
        results.push({
          ...message,
          score,
          highlights: [message.content.slice(0, 100)],
          resultType: 'message',
        })
      }
    }

    return ok(results.sort((a, b) => b.score - a.score).slice(0, limit))
  }

  private _getBestTokenScore(query: string, text: string): number {
    const tokens = text.toLowerCase().split(/\s+/)
    let bestScore = 0

    for (const token of tokens) {
      const score = damerauLevenshteinSimilarity(query, token)
      if (score > bestScore) {
        bestScore = score
      }
    }

    return bestScore
  }
}
