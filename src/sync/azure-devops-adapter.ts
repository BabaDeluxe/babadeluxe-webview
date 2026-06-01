import { BaseBackendDriver } from './base-driver'
import { type AzureDevOpsConfig } from '@/sync/types'

export class AzureDevOpsBackendDriver extends BaseBackendDriver {
  readonly name = 'azure-devops'
  private readonly _apiBase: string

  constructor(private readonly _config: AzureDevOpsConfig) {
    super()
    this._apiBase =
      _config.apiBase || `https://dev.azure.com/${_config.org}/${_config.project}/_apis`
  }

  getRootUrl(): string {
    return `git/repositories/${this._config.repo}/`
  }

  protected _getHeaders(): Record<string, string> {
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Authorization: `Basic ${btoa(':' + this._config.pat)}`,
      'Content-Type': 'application/json',
    }
  }

  protected async _performTestCall() {
    return this._fetch(`${this._apiBase}/git/repositories/${this._config.repo}?api-version=7.1`)
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const baseUrl = `${this._apiBase}/${shardUrl}`
    const refsRes = await this._fetch(`${baseUrl}refs?filter=heads/main&api-version=7.1`)
    const refsData = (await refsRes.json()) as { value?: Array<{ objectId: string }> }
    const oldObjectId = refsData.value?.[0]?.objectId || '0000000000000000000000000000000000000000'

    const itemRes = await this._fetch(`${baseUrl}items?path=/${path}&api-version=7.1`, {
      method: 'HEAD',
    })
    const changeType = itemRes.ok ? 'edit' : 'add'

    const body = {
      refUpdates: [{ name: 'refs/heads/main', oldObjectId }],
      commits: [
        {
          comment: `sync: write ${path}`,
          changes: [
            {
              changeType,
              item: { path: `/${path}` },
              newContent: { content, contentType: 'base64Encoded' },
            },
          ],
        },
      ],
    }
    const res = await this._fetch(`${baseUrl}pushes?api-version=7.1`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Failed to push file ${path}: ${res.status}`)
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const url = `${this._apiBase}/${shardUrl}items?path=/${path}&includeContent=true&api-version=7.1`
    const res = await this._fetch(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    return res.text()
  }

  async isShardFull(shardUrl: string): Promise<boolean> {
    const res = await this._fetch(`${this._apiBase}/${shardUrl}?api-version=7.1`)
    if (!res.ok) return false
    const data = (await res.json()) as { size?: number }
    return (data.size || 0) * 1024 > 4800000000
  }

  async createNewShardFolder(index: number): Promise<string> {
    const res = await this._fetch(`${this._apiBase}/git/repositories?api-version=7.1`, {
      method: 'POST',
      body: JSON.stringify({ name: `shard-${index}` }),
    })
    if (!res.ok) throw new Error(`Failed to create repo: ${res.status}`)
    return `git/repositories/shard-${index}/`
  }
}
