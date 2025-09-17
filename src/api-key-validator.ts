/* eslint-disable @typescript-eslint/naming-convention */
export class ApiKeyValidator {
  async validate(provider: string, apiKey: string): Promise<boolean> {
    switch (provider) {
      case 'openai': {
        return this._validateOpenAi(apiKey)
      }

      case 'anthropic': {
        return this._validateAnthropic(apiKey)
      }

      case 'google': {
        return this._validateGoogle(apiKey)
      }

      default: {
        return false
      }
    }
  }

  // OpenAI via resultT (models list)
  // Docs: GET https://api.openai.com/v1/models
  // Auth: Authorization: Bearer <OPENAI_API_KEY>
  private async _validateOpenAi(apiKey: string): Promise<boolean> {
    try {
      const result = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })
      // Treat explicit auth failuresult as invalid; allow other non-OKs (429/5xx) as inconclusive/true.
      if (result.status === 401 || result.status === 403) {
        return false
      }

      return result.ok || result.status === 429 || result.status === 400
    } catch {
      return false
    }
  }

  // Anthropic via resultT (messages create)
  // Docs: POST https://api.anthropic.com/v1/messages
  // Required headers: x-api-key, anthropic-version: 2023-06-01
  private async _validateAnthropic(apiKey: string): Promise<boolean> {
    try {
      const result = await fetch('https://api.anthropic.com/v1/messages', {
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
      })
      // Match the original behavior: invalid only on 401/403; 200/400/429 imply the key is recognized.
      if (result.status === 401 || result.status === 403) {
        return false
      }

      return result.ok || result.status === 400 || result.status === 429
    } catch {
      return false
    }
  }

  // Google Gemini via resultT (models list — non-billable)
  // Docs: GET https://generativelanguage.googleapis.com/v1beta/models?key=...
  // Alternative (billable): POST .../models/<model>:generateContent with x-goog-api-key
  private async _validateGoogle(apiKey: string): Promise<boolean> {
    try {
      const result = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      )
      if (result.status === 401 || result.status === 403) {
        return false
      }

      return result.ok || result.status === 429 || result.status === 400
    } catch {
      return false
    }
  }
}
