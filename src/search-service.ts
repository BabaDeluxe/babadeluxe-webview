import { ok, err, type Result } from 'neverthrow'
import type { AbstractLogger } from '@/logger'
import { damerauLevenshteinSimilarity } from '@babadeluxe/shared'
import type { Conversation, Message } from '@/database/types'
import { type AppDb } from '@/database/app-db'
import type { SearchResult } from '@/search-types'
import { type DbError, NetworkError } from '@/errors'

export class SearchService {
  constructor(
    private readonly _db: AppDb,
    private readonly _logger: AbstractLogger
  ) {}

  async search(query: string, limit = 10): Promise<Result<SearchResult[], NetworkError>> {
    const conversationsResult = await this._db.getAllConversations()
    if (conversationsResult.isErr()) {
      this._logger.error('Failed to get all conversations for search', {
        query,
        error: conversationsResult.error,
      })
      return err(conversationsResult.error)
    }

    const allMessagesResult = await this._getAllMessages()
    if (allMessagesResult.isErr()) {
      return err(new NetworkError('Failed to get all messages for search', allMessagesResult.error))
    }

    const searchResult = this._performSearch(
      query,
      [...conversationsResult.value],
      allMessagesResult.value,
      limit
    )

    return searchResult
  }

  private async _getAllMessages(): Promise<Result<Message[], DbError>> {
    // Optimization: Fetch all messages at once instead of N+1 selects loop
    const result = await this._db.message.toArray()

    if (result.isErr()) {
      this._logger.error('Failed to get all messages for search', {
        error: result.error,
      })
      return err(result.error)
    }

    // Map DbMessage to Message (skipping context reference decoding for performance as search doesn't use it)
    const mapped: Message[] = result.value.map((dbMsg) => ({
      id: dbMsg.id!,
      conversationId: dbMsg.conversationId,
      role: dbMsg.role,
      timestamp: dbMsg.timestamp,
      content: dbMsg.content,
      isStreaming: dbMsg.isStreaming,
      model: dbMsg.model,
      systemPrompt: dbMsg.systemPrompt,
      contextReferences: undefined,
    }))

    return ok(mapped)
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
