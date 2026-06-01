import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import type { ISyncBackendDriver } from '@/sync/types'

export abstract class BaseBackendDriver implements ISyncBackendDriver {
  abstract readonly name: string

  abstract getRootUrl(): string
  abstract putFile(shardUrl: string, path: string, content: string): Promise<void>
  abstract getFile(shardUrl: string, path: string): Promise<string | null>
  abstract isShardFull(shardUrl: string): Promise<boolean>
  abstract createNewShardFolder(index: number): Promise<string>

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._performTestCall()
      return this._handleResponse(res)
    } catch (e) {
      return err(new SyncError(this.name, e instanceof Error ? e.message : String(e), e))
    }
  }

  protected abstract _performTestCall(): Promise<Response>

  protected async _handleResponse(res: Response): Promise<Result<void, SyncError>> {
    if (res.status === 401 || res.status === 403) {
      if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
        return err(new RateLimitError(`${this.name} rate limit exceeded`))
      }
      return err(new SyncAuthError(this.name, `HTTP ${res.status}`))
    }
    if (res.status === 429) {
      return err(new RateLimitError(`${this.name} rate limit exceeded`))
    }
    if (!res.ok) {
      return err(new SyncError(this.name, `HTTP ${res.status}`))
    }
    return ok(undefined)
  }

  protected async _fetch(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...this._getHeaders(),
        ...init?.headers,
      },
    })
    return response
  }

  protected abstract _getHeaders(): Record<string, string>
}
