/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import { BaseSyncAdapter } from '@/sync/base-adapter'
import { loadMetadata } from '@/sync/shard-utils'
import { type WebDavConfig, type FetchFn, type FetchResponse } from '@/sync/types'

export class WebDavSyncAdapter extends BaseSyncAdapter {
  readonly name = 'webdav'
  private readonly _auth: string

  constructor(private readonly _config: WebDavConfig) {
    super(_config.url)
    this._auth = `Basic ${btoa(this._config.username + ':' + this._config.password)}`
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._getFetch()(this._config.url, {
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
      return res as FetchResponse
    }
  }

  protected async _putFile(shardUrl: string, path: string, content: string): Promise<void> {
    const url = shardUrl.endsWith('/') ? `${shardUrl}${path}` : `${shardUrl}/${path}`

    if (path.includes('/')) {
      const parts = path.split('/')
      let current = shardUrl
      for (let i = 0; i < parts.length - 1; i++) {
        const folder = parts[i]
        current = current.endsWith('/') ? `${current}${folder}` : `${current}/${folder}`
        await this._getFetch()(current, { method: 'MKCOL' }).catch(() => {})
      }
    }

    const res = await this._getFetch()(url, {
      method: 'PUT',
      body: content,
    })

    if (!res.ok) {
      throw new Error(`Failed to PUT file ${path}: ${res.status}`)
    }
  }

  protected async _getFile(shardUrl: string, path: string): Promise<string | null> {
    const url = shardUrl.endsWith('/') ? `${shardUrl}${path}` : `${shardUrl}/${path}`
    const res = await this._getFetch()(url)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Failed to GET file ${path}: ${res.status}`)
    return await res.text()
  }

  protected async _isShardFull(shardUrl: string): Promise<boolean> {
    const metadata = await loadMetadata(this._getFetch(), shardUrl)
    return Object.keys(metadata.keys).length >= 50000
  }

  protected async _createNewShardFolder(index: number): Promise<string> {
    const folder = `shard-${index}`
    const url = this._config.url.endsWith('/')
      ? `${this._config.url}${folder}`
      : `${this._config.url}/${folder}`
    const res = await this._getFetch()(url, { method: 'MKCOL' })
    if (!res.ok && res.status !== 405) {
      throw new Error(`Failed to create shard folder ${folder}: ${res.status}`)
    }
    return url
  }
}
