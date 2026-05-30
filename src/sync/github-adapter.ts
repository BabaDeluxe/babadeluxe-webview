/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import {
  type FetchFn,
  type GitHubConfig,
  type FetchResponse,
  type ISyncBackendDriver,
} from '@/sync/types'

export class GitHubBackendDriver implements ISyncBackendDriver {
  readonly name = 'github'
  private readonly _branch: string

  constructor(private readonly _config: GitHubConfig) {
    this._branch = _config.branch || 'main'
  }

  getRootUrl(): string {
    return 'https://api.github.com'
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this.getFetch()(
        `https://api.github.com/repos/${this._config.owner}/${this._config.repo}`
      )
      if (res.status === 401 || res.status === 403) {
        // If it's 403 but not rate limit, it's auth error (e.g. invalid scopes)
        if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
          return err(new RateLimitError('GitHub rate limit exceeded'))
        }
        return err(new SyncAuthError(this.name, `HTTP ${res.status}`))
      }
      if (!res.ok) {
        return err(new SyncError(this.name, `HTTP ${res.status}`))
      }
      return ok(undefined)
    } catch (e) {
      if (e instanceof RateLimitError) return err(e)
      return err(new SyncError(this.name, e instanceof Error ? e.message : String(e), e))
    }
  }

  getFetch(): FetchFn {
    return async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${this._config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
        throw new RateLimitError('GitHub rate limit exceeded')
      }
      return res as FetchResponse
    }
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const url = `https://api.github.com/repos/${this._config.owner}/${this._config.repo}/contents/${prefixedPath}`

    const getRes = await this.getFetch()(`${url}?ref=${this._branch}`)
    let sha: string | undefined
    if (getRes.ok) {
      const data = (await getRes.json()) as { sha: string }
      sha = data.sha
    }

    const res = await this.getFetch()(url, {
      method: 'PUT',
      body: JSON.stringify({
        message: `sync: write ${path}`,
        content,
        branch: this._branch,
        sha,
      }),
    })

    if (!res.ok) {
      throw new Error(`Failed to PUT file ${path}: ${res.status}`)
    }
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const url = `https://api.github.com/repos/${this._config.owner}/${this._config.repo}/contents/${prefixedPath}?ref=${this._branch}`
    const res = await this.getFetch()(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    const data = (await res.json()) as { content: string }
    return data.content.replace(/\n/g, '')
  }

  async isShardFull(): Promise<boolean> {
    const res = await this.getFetch()(
      `https://api.github.com/repos/${this._config.owner}/${this._config.repo}`
    )
    if (!res.ok) return false
    const data = (await res.json()) as { size: number }
    const size = (data.size || 0) * 1024
    return size > 4800000000
  }

  async createNewShardFolder(index: number): Promise<string> {
    return `shard-${index}`
  }
}
