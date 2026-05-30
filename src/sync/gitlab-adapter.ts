/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import { BaseSyncAdapter } from '@/sync/base-adapter'
import { type FetchFn, type GitLabConfig, type FetchResponse } from '@/sync/types'

export class GitLabSyncAdapter extends BaseSyncAdapter {
  readonly name = 'gitlab'
  private readonly _apiBase: string

  constructor(private readonly _config: GitLabConfig) {
    const apiBase = _config.apiBase || 'https://gitlab.com/api/v4'
    super(apiBase)
    this._apiBase = apiBase
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._getFetch()(`${this._apiBase}/user`)
      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError(this.name, `HTTP ${res.status}`))
      }
      if (!res.ok) {
        return err(new SyncError(this.name, `HTTP ${res.status}`))
      }
      return ok(undefined)
    } catch (e) {
      return err(this._handleError(e))
    }
  }

  protected _getFetch(): FetchFn {
    return async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${this._config.token}`,
        },
      })
      if (res.status === 429) {
        throw new RateLimitError('GitLab rate limit exceeded')
      }
      return res as FetchResponse
    }
  }

  protected async _putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const encodedPath = encodeURIComponent(prefixedPath)
    const url = `${this._apiBase}/projects/${this._config.projectId}/repository/files/${encodedPath}`

    const checkRes = await this._getFetch()(`${url}?ref=main`, { method: 'HEAD' })
    const method = checkRes.ok ? 'PUT' : 'POST'

    const res = await this._getFetch()(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch: 'main',
        content,
        commit_message: `sync: write ${path}`,
        encoding: 'base64',
      }),
    })

    if (!res.ok) {
      throw new Error(`Failed to ${method} file ${path}: ${res.status}`)
    }
  }

  protected async _getFile(shardUrl: string, path: string): Promise<string | null> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const encodedPath = encodeURIComponent(prefixedPath)
    const url = `${this._apiBase}/projects/${this._config.projectId}/repository/files/${encodedPath}?ref=main`
    const res = await this._getFetch()(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    const data = (await res.json()) as { content: string }
    return data.content
  }

  protected async _isShardFull(): Promise<boolean> {
    const res = await this._getFetch()(
      `${this._apiBase}/projects/${this._config.projectId}?statistics=true`
    )
    if (!res.ok) return false
    const data = (await res.json()) as { statistics: { repository_size: number } }
    const size = data.statistics?.repository_size || 0
    return size > 4800000000
  }

  protected async _createNewShardFolder(index: number): Promise<string> {
    return `shard-${index}`
  }
}
