/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import { type GitHubConfig, type ISyncBackendDriver, type GotInstance } from '@/sync/types'
import got from 'got'

export class GitHubBackendDriver implements ISyncBackendDriver {
  readonly name = 'github'
  private readonly _branch: string
  private readonly _got: GotInstance

  constructor(private readonly _config: GitHubConfig) {
    this._branch = _config.branch || 'main'
    this._got = got.extend({
      prefixUrl: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${this._config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      throwHttpErrors: false,
      responseType: 'json',
    }) as unknown as GotInstance
  }

  getRootUrl(): string {
    return 'https://api.github.com'
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._got.get(`repos/${this._config.owner}/${this._config.repo}`)
      if (res.statusCode === 401 || res.statusCode === 403) {
        if (res.statusCode === 403 && res.headers['x-ratelimit-remaining'] === '0') {
          return err(new RateLimitError('GitHub rate limit exceeded'))
        }
        return err(new SyncAuthError(this.name, `HTTP ${res.statusCode}`))
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
    const url = `repos/${this._config.owner}/${this._config.repo}/contents/${prefixedPath}`

    const getRes = await this._got.get<{ sha: string }>(url, {
      searchParams: { ref: this._branch },
    })
    let sha: string | undefined
    if (getRes.statusCode === 200) {
      sha = getRes.body.sha
    }

    const res = await this._got.put(url, {
      json: {
        message: `sync: write ${path}`,
        content,
        branch: this._branch,
        sha,
      },
    })

    if (res.statusCode >= 400) {
      throw new Error(`Failed to PUT file ${path}: ${res.statusCode}`)
    }
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `${shardUrl}/${path}` : path
    const url = `repos/${this._config.owner}/${this._config.repo}/contents/${prefixedPath}`
    const res = await this._got.get<{ content: string }>(url, {
      searchParams: { ref: this._branch },
    })

    if (res.statusCode === 404) return null
    if (res.statusCode >= 400) throw new Error(`Failed to GET file ${path}: ${res.statusCode}`)

    return res.body.content.replace(/\n/g, '')
  }

  async isShardFull(): Promise<boolean> {
    const res = await this._got.get<{ size: number }>(
      `repos/${this._config.owner}/${this._config.repo}`
    )
    if (res.statusCode >= 400) return false
    const size = (res.body.size || 0) * 1024
    return size > 4800000000
  }

  async createNewShardFolder(index: number): Promise<string> {
    return `shard-${index}`
  }
}
