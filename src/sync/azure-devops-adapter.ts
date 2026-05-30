/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, RateLimitError } from '@/errors'
import { BaseSyncAdapter } from '@/sync/base-adapter'
import { type FetchFn, type AzureDevOpsConfig, type FetchResponse } from '@/sync/types'

export class AzureDevOpsSyncAdapter extends BaseSyncAdapter {
  readonly name = 'azure-devops'
  private readonly _apiBase: string
  private readonly _auth: string

  constructor(private readonly _config: AzureDevOpsConfig) {
    const apiBase =
      _config.apiBase || `https://dev.azure.com/${_config.org}/${_config.project}/_apis`
    super(apiBase)
    this._apiBase = apiBase
    this._auth = `Basic ${btoa(':' + this._config.pat)}`
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._getFetch()(
        `${this._apiBase}/git/repositories/${this._config.repo}?api-version=7.1`
      )
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
          Authorization: this._auth,
        },
      })
      if (res.status === 429) {
        throw new RateLimitError('Azure DevOps rate limit exceeded')
      }
      return res as FetchResponse
    }
  }

  protected async _putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `/${shardUrl}/${path}` : `/${path}`

    const refsRes = await this._getFetch()(
      `${this._apiBase}/git/repositories/${this._config.repo}/refs?filter=heads/main&api-version=7.1`
    )
    if (!refsRes.ok) throw new Error(`Failed to fetch refs: ${refsRes.status}`)
    const refsData = (await refsRes.json()) as { value: Array<{ objectId: string }> }
    const oldObjectId = refsData.value?.[0]?.objectId || '0000000000000000000000000000000000000000'

    const itemRes = await this._getFetch()(
      `${this._apiBase}/git/repositories/${
        this._config.repo
      }/items?path=${encodeURIComponent(prefixedPath)}&api-version=7.1`,
      { method: 'HEAD' }
    )
    const changeType = itemRes.ok ? 'edit' : 'add'

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

    const res = await this._getFetch()(
      `${this._apiBase}/git/repositories/${this._config.repo}/pushes?api-version=7.1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      throw new Error(`Failed to push file ${path}: ${res.status}`)
    }
  }

  protected async _getFile(shardUrl: string, path: string): Promise<string | null> {
    const prefixedPath = shardUrl.startsWith('shard-') ? `/${shardUrl}/${path}` : `/${path}`
    const url = `${this._apiBase}/git/repositories/${
      this._config.repo
    }/items?path=${encodeURIComponent(prefixedPath)}&includeContent=true&api-version=7.1`
    const res = await this._getFetch()(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    return await res.text()
  }

  protected async _isShardFull(): Promise<boolean> {
    const res = await this._getFetch()(
      `${this._apiBase}/git/repositories/${this._config.repo}?api-version=7.1`
    )
    if (!res.ok) return false
    const data = (await res.json()) as { size: number }
    const size = data.size || 0
    return size > 8000000000
  }

  protected async _createNewShardFolder(index: number): Promise<string> {
    return `shard-${index}`
  }
}
