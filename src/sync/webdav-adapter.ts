/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import {
  type WebDavConfig,
  type FetchFn,
  type FetchResponse,
  type ISyncBackendDriver,
} from '@/sync/types'

export class WebDavBackendDriver implements ISyncBackendDriver {
  readonly name = 'webdav'
  private readonly _auth: string

  constructor(private readonly _config: WebDavConfig) {
    this._auth = `Basic ${btoa(this._config.username + ':' + this._config.password)}`
  }

  getRootUrl(): string {
    return this._config.url
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this.getFetch()(this._config.url, {
        method: 'PROPFIND',
        headers: {
          Depth: '0',
        },
      })

      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError(this.name, `HTTP ${res.status}`))
      }

      if (!res.ok) {
        return err(new SyncError(this.name, `HTTP ${res.status}`))
      }

      return ok(undefined)
    } catch (e) {
      return err(new SyncError(this.name, e instanceof Error ? e.message : String(e), e))
    }
  }

  getFetch(): FetchFn {
    return async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: this._auth,
        },
      })
      return res as FetchResponse
    }
  }

  async putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const url = shardUrl.endsWith('/') ? `${shardUrl}${path}` : `${shardUrl}/${path}`

    if (path.includes('/')) {
      const parts = path.split('/')
      let current = shardUrl
      for (let i = 0; i < parts.length - 1; i++) {
        const folder = parts[i]
        current = current.endsWith('/') ? `${current}${folder}` : `${current}/${folder}`
        await this.getFetch()(current, { method: 'MKCOL' }).catch(() => {})
      }
    }

    const res = await this.getFetch()(url, {
      method: 'PUT',
      body: content,
    })

    if (!res.ok) {
      throw new Error(`Failed to PUT file ${path}: ${res.status}`)
    }
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const url = shardUrl.endsWith('/') ? `${shardUrl}${path}` : `${shardUrl}/${path}`
    const res = await this.getFetch()(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    return await res.text()
  }

  async isShardFull(shardUrl: string): Promise<boolean> {
    const url = shardUrl.endsWith('/')
      ? `${shardUrl}.sync_metadata.json`
      : `${shardUrl}/.sync_metadata.json`
    const res = await this.getFetch()(url)
    if (res.status === 404) return false
    if (!res.ok) throw new Error(`Failed to load metadata: ${res.status}`)
    const metadata = (await res.json()) as { keys: Record<string, unknown> }
    return Object.keys(metadata.keys).length >= 50000
  }

  async createNewShardFolder(index: number): Promise<string> {
    const folder = `shard-${index}`
    const url = this._config.url.endsWith('/')
      ? `${this._config.url}${folder}`
      : `${this._config.url}/${folder}`
    const res = await this.getFetch()(url, { method: 'MKCOL' })
    if (!res.ok && res.status !== 405) {
      throw new Error(`Failed to create shard folder ${folder}: ${res.status}`)
    }
    return url
  }
}
