/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import { type GitLabConfig, type ISyncBackendDriver, type GotInstance } from '@/sync/types'
import got from 'got'

export class GitLabBackendDriver implements ISyncBackendDriver {
  readonly name = 'gitlab'
  private readonly _apiBase: string
  private readonly _got: GotInstance

  constructor(private readonly _config: GitLabConfig) {
    this._apiBase = this._config.apiBase || 'https://gitlab.com/api/v4'
    this._got = got.extend({
      prefixUrl: this._apiBase,
      headers: {
        Authorization: `Bearer ${this._config.token}`,
      },
      throwHttpErrors: false,
      responseType: 'json',
    }) as unknown as GotInstance
  }

  getRootUrl(): string {
    return this._apiBase
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._got.get('user')
      if (res.statusCode === 401 || res.statusCode === 403) {
        return err(new SyncAuthError(this.name, `HTTP ${res.statusCode}`))
      }
      if (res.statusCode === 429) {
        return err(new RateLimitError('GitLab rate limit exceeded'))
      }
      if (res.statusCode >= 400) {
        return err(new SyncError(this.name, `HTTP ${res.statusCode}`))
      }
      return ok(undefined)
    } catch (e) {
      return err(new SyncError(this.name, e instanceof Error ? e.message : String(e), e))
    }
  }

  getGot(): GotInstance {
    return this._got
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const encodedPath = encodeURIComponent(prefixedPath)
    const url = `projects/${this._config.projectId}/repository/files/${encodedPath}`

    const checkRes = await this._got.head(url, { searchParams: { ref: 'main' } })
    const method = checkRes.statusCode < 400 ? 'put' : 'post'

    const res = await this._got[method](url, {
      json: {
        branch: 'main',
        content,
        commit_message: `sync: write ${path}`,
        encoding: 'base64',
      },
    })

    if (res.statusCode >= 400) {
      throw new Error(`Failed to ${method.toUpperCase()} file ${path}: ${res.statusCode}`)
    }
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const encodedPath = encodeURIComponent(prefixedPath)
    const url = `projects/${this._config.projectId}/repository/files/${encodedPath}`
    const res = await this._got.get<{ content: string }>(url, {
      searchParams: { ref: 'main' },
    })

    if (res.statusCode === 404) return null
    if (res.statusCode >= 400) throw new Error(`Failed to GET file ${path}: ${res.statusCode}`)

    return res.body.content
  }

  async isShardFull(): Promise<boolean> {
    const res = await this._got.get<{ statistics: { repository_size: number } }>(
      `projects/${this._config.projectId}`,
      { searchParams: { statistics: 'true' } }
    )
    if (res.statusCode >= 400) return false
    const size = res.body.statistics?.repository_size || 0
    return size > 4800000000
  }

  async createNewShardFolder(index: number): Promise<string> {
    return `shard-${index}`
  }
}
