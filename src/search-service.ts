import { ok, err, type Result } from 'neverthrow'
import type { AbstractLogger } from '@/logger'
import { damerauLevenshteinSimilarity } from '@babadeluxe/shared'
import { type AppDb } from '@/database/app-db'
import type { SearchResult } from '@/search-types'
import { NetworkError } from '@/errors'

export class SearchService {
  constructor(
    private readonly _db: AppDb,
    private readonly _logger: AbstractLogger
  ) {}

  async search(query: string, limit = 10): Promise<Result<SearchResult[], NetworkError>> {
    const normalizedQuery = query.toLowerCase()

    // 1. Search in conversations
    const conversationsResult = await this._db.conversation.toArray()
    if (conversationsResult.isErr()) {
      this._logger.error('Failed to get all conversations for search', {
        query,
        error: conversationsResult.error,
      })
      return err(
        new NetworkError('Failed to fetch conversations for search', conversationsResult.error)
      )
    }

    const conversationResults: SearchResult[] = []
    for (const conversation of conversationsResult.value) {
      const score = this._getBestTokenScore(normalizedQuery, conversation.title)
      if (score > 0.3) {
        conversationResults.push({
          ...conversation,
          score,
          highlights: [conversation.title],
          resultType: 'conversation',
        })
      }
    }

    // 2. Search in messages
    const messagesResult = await this._db.message.toArray()
    if (messagesResult.isErr()) {
      return err(new NetworkError('Failed to fetch messages for search', messagesResult.error))
    }

    const messageResults: SearchResult[] = []
    for (const dbMsg of messagesResult.value) {
      const score = this._getBestTokenScore(normalizedQuery, dbMsg.content)
      if (score > 0.3) {
        messageResults.push({
          id: dbMsg.id ?? 0,
          conversationId: dbMsg.conversationId,
          role: dbMsg.role,
          timestamp: dbMsg.timestamp,
          content: dbMsg.content,
          isStreaming: dbMsg.isStreaming,
          model: dbMsg.model,
          systemPrompt: dbMsg.systemPrompt,
          score,
          highlights: [dbMsg.content.slice(0, 100)],
          resultType: 'message',
        })
      }
    }

    const combinedResults = [...conversationResults, ...messageResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return ok(combinedResults)
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
