/* eslint-disable @typescript-eslint/naming-convention */
import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import { type WebDavConfig, type GotInstance, type ISyncBackendDriver } from '@/sync/types'
import got from 'got'

export class WebDavBackendDriver implements ISyncBackendDriver {
  readonly name = 'webdav'
  private readonly _got: GotInstance

  constructor(private readonly _config: WebDavConfig) {
    this._got = got.extend({
      prefixUrl: this._config.url,
      headers: {
        Authorization: `Basic ${btoa(this._config.username + ':' + this._config.password)}`,
      },
      throwHttpErrors: false,
      responseType: 'text',
    }) as unknown as GotInstance
  }

  getRootUrl(): string {
    return this._config.url
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      const res = await this._got('', {
        method: 'PROPFIND',
        headers: {
          Depth: '0',
        },
      })

      if (res.statusCode === 401 || res.statusCode === 403) {
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
    if (path.includes('/')) {
      const parts = path.split('/')
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current += (current ? '/' : '') + parts[i]
        await this._got(current, { method: 'MKCOL' })
      }
    }

    const res = await this._got.put(path, {
      body: content,
    })

    if (res.statusCode >= 400) {
      throw new Error(`Failed to PUT file ${path}: ${res.statusCode}`)
    }
  }

  async getFile(shardUrl: string, path: string): Promise<string | null> {
    const res = await this._got.get(path)
    if (res.statusCode === 404) return null
    if (res.statusCode >= 400) throw new Error(`Failed to GET file ${path}: ${res.statusCode}`)
    return res.body as string
  }

  async isShardFull(): Promise<boolean> {
    const res = await this._got.get('.sync_metadata.json', { responseType: 'json' })
    if (res.statusCode === 404) return false
    if (res.statusCode >= 400) throw new Error(`Failed to load metadata: ${res.statusCode}`)
    const metadata = res.body as { keys: Record<string, unknown> }
    return Object.keys(metadata.keys).length >= 50000
  }

  async createNewShardFolder(index: number): Promise<string> {
    const folder = `shard-${index}`
    const res = await this._got(folder, { method: 'MKCOL' })
    if (res.statusCode >= 400 && res.statusCode !== 405) {
      throw new Error(`Failed to create shard folder ${folder}: ${res.statusCode}`)
    }
    return folder
  }
}
