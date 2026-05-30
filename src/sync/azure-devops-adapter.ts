/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import { type AzureDevOpsConfig, type ISyncBackendDriver, type GotInstance } from '@/sync/types'
import got from 'got'

export class AzureDevOpsBackendDriver implements ISyncBackendDriver {
  readonly name = 'azure-devops'
  private readonly _apiBase: string
  private readonly _got: GotInstance

  constructor(private readonly _config: AzureDevOpsConfig) {
    this._apiBase =
      _config.apiBase || `https://dev.azure.com/${_config.org}/${_config.project}/_apis`
    this._got = got.extend({
      prefixUrl: this._apiBase,
      headers: {
        Authorization: `Basic ${btoa(':' + this._config.pat)}`,
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
      const res = await this._got.get(`git/repositories/${this._config.repo}`, {
        searchParams: { 'api-version': '7.1' },
      })
      if (res.statusCode === 401 || res.statusCode === 403) {
        return err(new SyncAuthError(this.name, `HTTP ${res.statusCode}`))
      }
      if (res.statusCode === 429) {
        return err(new RateLimitError('Azure DevOps rate limit exceeded'))
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
    const prefixedPath = shardUrl.startsWith('shard-') ? `/${shardUrl}/${path}` : `/${path}`

    const refsRes = await this._got.get<{ value: Array<{ objectId: string }> }>(
      `git/repositories/${this._config.repo}/refs`,
      { searchParams: { filter: 'heads/main', 'api-version': '7.1' } }
    )
    if (refsRes.statusCode >= 400) throw new Error(`Failed to fetch refs: ${refsRes.statusCode}`)
    const oldObjectId =
      refsRes.body.value?.[0]?.objectId || '0000000000000000000000000000000000000000'

    const itemRes = await this._got.head(`git/repositories/${this._config.repo}/items`, {
      searchParams: { path: prefixedPath, 'api-version': '7.1' },
    })
    const changeType = itemRes.statusCode === 200 ? 'edit' : 'add'

    const body = {
      refUpdates: [{ name: 'refs/heads/main', oldObjectId }],
      commits: [
        {
          comment: `sync: write ${path}`,
          changes: [
            {
              changeType,
              item: { path: prefixedPath },
              newContent: { content, contentType: 'base64Encoded' },
            },
          ],
        },
      ],
    }

    const res = await this._got.post(`git/repositories/${this._config.repo}/pushes`, {
      searchParams: { 'api-version': '7.1' },
      json: body,
    })

    if (res.statusCode >= 400) {
      throw new Error(`Failed to push file ${path}: ${res.statusCode}`)
    }
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `/${shardUrl}/${path}` : `/${path}`
    const url = `git/repositories/${this._config.repo}/items`
    const res = await this._got.get(url, {
      searchParams: { path: prefixedPath, includeContent: 'true', 'api-version': '7.1' },
      responseType: 'text',
    })

    if (res.statusCode === 404) return null
    if (res.statusCode >= 400) throw new Error(`Failed to GET file ${path}: ${res.statusCode}`)

    return res.body as string
  }

  async isShardFull(): Promise<boolean> {
    const res = await this._got.get<{ size: number }>(`git/repositories/${this._config.repo}`, {
      searchParams: { 'api-version': '7.1' },
    })
    if (res.statusCode >= 400) return false
    const size = res.body.size || 0
    return size > 8000000000
  }

  async createNewShardFolder(index: number): Promise<string> {
    return `shard-${index}`
  }
}
