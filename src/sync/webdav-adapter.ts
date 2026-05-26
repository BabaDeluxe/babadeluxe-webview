import { createClient, type WebDAVClient, type FileStat } from 'webdav'
import { ok, err, ResultAsync, type Result } from 'neverthrow'
import { SyncError, SyncAuthError, ConflictError } from '@/errors'
import type { ISyncAdapter, SyncPayload } from '@/sync/types'

const CHATS_DIR = 'chats'

export class WebDAVSyncAdapter implements ISyncAdapter {
  readonly name = 'webdav'
  readonly backend = 'webdav' as const
  private readonly _client: WebDAVClient
  private readonly _etags = new Map<number, string>()

  constructor(private readonly _config: { url: string; username: string; password: string }) {
    this._client = createClient(_config.url, {
      username: _config.username,
      password: _config.password,
    })
  }

  async push(payload: SyncPayload): Promise<Result<void, SyncError | ConflictError>> {
    if (payload.deletedAt) {
      return this.notifyDeleted(payload.conversation.id)
    }

    const id = payload.conversation.id
    const filePath = this._filePath(id)
    const tmpPath = `${filePath}.tmp`
    const content = JSON.stringify(payload)

    const result = await ResultAsync.fromPromise(
      this._client.stat(filePath),
      () => null
    ).andThen((remoteStat) => {
      if (remoteStat && !('data' in remoteStat)) {
        const remoteEtag = (remoteStat as FileStat).etag
        const localEtag = this._etags.get(id)

        if (localEtag && remoteEtag && localEtag !== remoteEtag) {
          return this._fetchAndConflict(id, payload, remoteEtag)
        }
      }
      return ok(undefined)
    }).andThen(() => {
      return this._ensureDirectory().andThen(() => {
        return ResultAsync.fromPromise(
          this._client.putFileContents(tmpPath, content),
          (e) => this._mapError(e)
        )
      }).andThen(() => {
        return ResultAsync.fromPromise(
          this._client.moveFile(tmpPath, filePath),
          (e) => this._mapError(e)
        )
      }).andThen(() => {
        return ResultAsync.fromPromise(
          this._client.stat(filePath),
          (e) => this._mapError(e)
        )
      }).andThen((newStat) => {
        if (!('data' in newStat) && (newStat as FileStat).etag) {
          this._etags.set(id, (newStat as FileStat).etag!)
        }
        return ok(undefined)
      })
    })

    return result as Result<void, SyncError | ConflictError>
  }

  async pull(since?: string): Promise<Result<SyncPayload[], SyncError>> {
    const result = await this._ensureDirectory().andThen(() => {
      return ResultAsync.fromPromise(
        this._client.getDirectoryContents(CHATS_DIR),
        (e) => this._mapError(e)
      ).andThen((contents) => {
        const files = (contents as FileStat[]).filter(
          (item) => item.type === 'file' && item.filename.endsWith('.json') && !item.filename.endsWith('.tmp')
        )

        const sinceDate = since ? new Date(since) : null
        const filteredFiles = files.filter((file) => {
          if (!sinceDate) return true
          return new Date(file.lastmod) > sinceDate
        })

        const downloads = filteredFiles.map((file) => {
          return ResultAsync.fromPromise(
            this._client.getFileContents(file.filename, { format: 'text' }),
            (e) => this._mapError(e)
          ).andThen((content) => {
            try {
              const payload = JSON.parse(content as string) as SyncPayload
              if (file.etag) {
                this._etags.set(payload.conversation.id, file.etag)
              }
              return ok(payload)
            } catch (e) {
              return err(new SyncError('webdav', `Failed to parse payload for ${file.filename}`, e))
            }
          })
        })

        return ResultAsync.combine(downloads)
      })
    })

    return result
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    try {
      await this._client.stat(CHATS_DIR)
      return ok(undefined)
    } catch (e) {
      return err(this._mapError(e))
    }
  }

  async notifyDeleted(conversationId: number): Promise<Result<void, SyncError>> {
    const filePath = this._filePath(conversationId)
    const result = await ResultAsync.fromPromise(
      this._client.deleteFile(filePath),
      (e: any) => {
        if (e.status === 404) return 'ALREADY_DELETED'
        return this._mapError(e)
      }
    )

    if (result.isErr() && result.error !== 'ALREADY_DELETED') {
      return err(result.error as SyncError)
    }

    this._etags.delete(conversationId)
    return ok(undefined)
  }

  private _filePath(id: number): string {
    return `${CHATS_DIR}/${id}.json`
  }

  private _ensureDirectory(): ResultAsync<void, SyncError> {
    return ResultAsync.fromPromise(
      this._client.exists(CHATS_DIR),
      (e) => this._mapError(e)
    ).andThen((exists) => {
      if (!exists) {
        return ResultAsync.fromPromise(
          this._client.createDirectory(CHATS_DIR),
          (e) => this._mapError(e)
        ).map(() => undefined)
      }
      return ok(undefined)
    })
  }

  private _fetchAndConflict(id: number, localPayload: SyncPayload, remoteEtag: string): ResultAsync<never, SyncError | ConflictError> {
    return ResultAsync.fromPromise(
      this._client.getFileContents(this._filePath(id), { format: 'text' }),
      (e) => this._mapError(e)
    ).andThen((content) => {
      try {
        const remotePayload = JSON.parse(content as string) as SyncPayload
        this._etags.set(id, remoteEtag)
        return err(new ConflictError(
          'webdav',
          id,
          localPayload.syncVersion,
          remotePayload.syncVersion
        ))
      } catch (e) {
        return err(new SyncError('webdav', `Failed to parse remote payload for conflict resolution on ${id}`, e))
      }
    })
  }

  private _mapError(e: any): SyncError {
    if (e.status === 401 || e.status === 403) {
      return new SyncAuthError('webdav', e.message || String(e), e)
    }
    return new SyncError('webdav', e.message || String(e), e)
  }
}
