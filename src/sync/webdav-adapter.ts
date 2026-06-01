import { BaseBackendDriver } from './base-driver'
import { type WebDavConfig } from '@/sync/types'

export class WebDavBackendDriver extends BaseBackendDriver {
  readonly name = 'webdav'
  private readonly _createdDirs = new Set<string>()

  constructor(private readonly _config: WebDavConfig) {
    super()
  }

  getRootUrl(): string {
    const url = this._config.url
    return url.endsWith('/') ? url : url + '/'
  }

  protected _getHeaders(): Record<string, string> {
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Authorization: `Basic ${btoa(this._config.username + ':' + this._config.password)}`,
    }
  }

  protected async _performTestCall() {
    return this._fetch(this.getRootUrl(), {
      method: 'PROPFIND',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      headers: { Depth: '0' },
    })
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    if (path.includes('/')) {
      const parts = path.split('/')
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current += (current ? '/' : '') + parts[i]
        if (!this._createdDirs.has(shardUrl + current)) {
          await this._fetch(`${shardUrl}${current}`, { method: 'MKCOL' })
          this._createdDirs.add(shardUrl + current)
        }
      }
    }
    const res = await this._fetch(`${shardUrl}${path}`, { method: 'PUT', body: content })
    if (!res.ok) throw new Error(`Failed to PUT file ${path}: ${res.status}`)
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const res = await this._fetch(`${shardUrl}${path}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    return res.text()
  }

  async isShardFull(shardUrl: string): Promise<boolean> {
    const res = await this._fetch(`${shardUrl}.sync_metadata.json`)
    if (res.status === 404) return false
    const data = (await res.json()) as { keys?: Record<string, unknown> }
    return Object.keys(data?.keys || {}).length >= 50000
  }

  async createNewShardFolder(index: number): Promise<string> {
    const folder = `shard-${index}`
    const res = await this._fetch(`${this.getRootUrl()}${folder}`, { method: 'MKCOL' })
    if (!res.ok && res.status !== 405)
      throw new Error(`Failed to create shard folder ${folder}: ${res.status}`)
    return `${this.getRootUrl()}${folder}/`
  }
}
