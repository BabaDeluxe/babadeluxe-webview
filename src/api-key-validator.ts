import type { ConsoleLogger } from '@simwai/utils'
import { type Result, ok, err, fromPromise } from 'neverthrow'

type ValidationError =
  | { readonly type: 'invalid_key'; readonly provider: string }
  | { readonly type: 'network_error'; readonly provider: string; readonly cause: unknown }

export class ApiKeyValidator {
  constructor(private readonly _logger: ConsoleLogger) {}

  async validate(provider: string, apiKey: string): Promise<Result<boolean, ValidationError>> {
    switch (provider) {
      case 'openai':
        return this._validateOpenAi(apiKey)
      case 'anthropic':
        return this._validateAnthropic(apiKey)
      case 'google':
        return this._validateGoogle(apiKey)
      default:
        return ok(false)
    }
  }

  // OpenAI via resultT (models list)
  // Docs: GET https://api.openai.com/v1/models
  // Auth: Authorization: Bearer <OPENAI_API_KEY>
  private async _validateOpenAi(apiKey: string): Promise<Result<boolean, ValidationError>> {
    const fetchResult = await fromPromise(
      fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      (cause) => {
        this._logger.error('[ApiKeyValidator] OpenAI network error:', cause as Error)
        return { type: 'network_error' as const, provider: 'openai', cause }
      }
    )

    return fetchResult.match(
      (response) => {
        // Treat explicit auth failures as invalid; allow other non-OKs (429/5xx) as inconclusive/true.
        if (response.status === 401 || response.status === 403) {
          return err({ type: 'invalid_key' as const, provider: 'openai' })
        }
        return ok(response.ok || response.status === 429 || response.status === 400)
      },
      (error) => err(error)
    )
  }

  // Anthropic via resultT (messages create)
  // Docs: POST https://api.anthropic.com/v1/messages
  // Required headers: x-api-key, anthropic-version: 2023-06-01
  private async _validateAnthropic(apiKey: string): Promise<Result<boolean, ValidationError>> {
    const fetchResult = await fromPromise(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      }),
      (cause) => {
        this._logger.error('[ApiKeyValidator] Anthropic network error:', cause as Error)
        return { type: 'network_error' as const, provider: 'anthropic', cause }
      }
    )

    return fetchResult.match(
      (response) => {
        // Match the original behavior: invalid only on 401/403; 200/400/429 imply the key is recognized.
        if (response.status === 401 || response.status === 403) {
          return err({ type: 'invalid_key' as const, provider: 'anthropic' })
        }
        return ok(response.ok || response.status === 400 || response.status === 429)
      },
      (error) => err(error)
    )
  }

  // Google Gemini via resultT (models list — non-billable)
  // Docs: GET https://generativelanguage.googleapis.com/v1beta/models?key=...
  // Alternative (billable): POST .../models/<model>:generateContent with x-goog-api-key
  private async _validateGoogle(apiKey: string): Promise<Result<boolean, ValidationError>> {
    const fetchResult = await fromPromise(
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      ),
      (cause) => {
        this._logger.error('[ApiKeyValidator] Google network error:', cause as Error)
        return { type: 'network_error' as const, provider: 'google', cause }
      }
    )

    return fetchResult.match(
      (response) => {
        if (response.status === 401 || response.status === 403) {
          return err({ type: 'invalid_key' as const, provider: 'google' })
        }
        return ok(response.ok || response.status === 429 || response.status === 400)
      },
      (error) => err(error)
    )
  }
}
