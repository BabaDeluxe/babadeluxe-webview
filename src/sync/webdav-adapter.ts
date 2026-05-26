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

    const statResult = await ResultAsync.fromPromise(
      this._client.stat(filePath),
      () => null
    )

    if (statResult.isOk() && statResult.value && !('data' in statResult.value)) {
      const remoteStat = statResult.value as FileStat
      const remoteEtag = remoteStat.etag
      const localEtag = this._etags.get(id)

      if (localEtag && remoteEtag && localEtag !== remoteEtag) {
        const conflictResult = await this._fetchAndConflict(id, payload, remoteEtag)
        if (conflictResult.isErr()) return err(conflictResult.error)
      }
    }

    const ensureResult = await this._ensureDirectory()
    if (ensureResult.isErr()) return err(ensureResult.error)

    const putResult = await ResultAsync.fromPromise(
      this._client.putFileContents(tmpPath, content),
      (e) => this._mapError(e)
    )
    if (putResult.isErr()) return err(putResult.error)

    const moveResult = await ResultAsync.fromPromise(
      this._client.moveFile(tmpPath, filePath),
      (e) => this._mapError(e)
    )
    if (moveResult.isErr()) return err(moveResult.error)

    const newStatResult = await ResultAsync.fromPromise(
      this._client.stat(filePath),
      (e) => this._mapError(e)
    )
    if (newStatResult.isOk() && !('data' in newStatResult.value)) {
      const newStat = newStatResult.value as FileStat
      if (newStat.etag) {
        this._etags.set(id, newStat.etag)
      }
    }

    return ok(undefined)
  }

  async pull(since?: string): Promise<Result<SyncPayload[], SyncError>> {
    const ensureResult = await this._ensureDirectory()
    if (ensureResult.isErr()) return err(ensureResult.error)

    const listResult = await ResultAsync.fromPromise(
      this._client.getDirectoryContents(CHATS_DIR),
      (e) => this._mapError(e)
    )
    if (listResult.isErr()) return err(listResult.error)

    const contents = listResult.value
    const files = (contents as FileStat[]).filter(
      (item) => item.type === 'file' && item.filename.endsWith('.json') && !item.filename.endsWith('.tmp')
    )

    const sinceDate = since ? new Date(since) : null
    const filteredFiles = files.filter((file) => {
      if (!sinceDate) return true
      return new Date(file.lastmod) > sinceDate
    })

    const payloads: SyncPayload[] = []
    for (const file of filteredFiles) {
      const downloadResult = await ResultAsync.fromPromise(
        this._client.getFileContents(file.filename, { format: 'text' }),
        (e) => this._mapError(e)
      )
      if (downloadResult.isErr()) return err(downloadResult.error)

      try {
        const payload = JSON.parse(downloadResult.value as string) as SyncPayload
        if (file.etag) {
          this._etags.set(payload.conversation.id, file.etag)
        }
        payloads.push(payload)
      } catch (e) {
        return err(new SyncError('webdav', `Failed to parse payload for ${file.filename}`, e))
      }
    }

    return ok(payloads)
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

  private async _ensureDirectory(): Promise<Result<void, SyncError>> {
    const existsResult = await ResultAsync.fromPromise(
      this._client.exists(CHATS_DIR),
      (e) => this._mapError(e)
    )
    if (existsResult.isErr()) return err(existsResult.error)

    if (!existsResult.value) {
      const createResult = await ResultAsync.fromPromise(
        this._client.createDirectory(CHATS_DIR),
        (e) => this._mapError(e)
      )
      if (createResult.isErr()) return err(createResult.error)
    }

    return ok(undefined)
  }

  private async _fetchAndConflict(id: number, localPayload: SyncPayload, remoteEtag: string): Promise<Result<never, SyncError | ConflictError>> {
    const downloadResult = await ResultAsync.fromPromise(
      this._client.getFileContents(this._filePath(id), { format: 'text' }),
      (e) => this._mapError(e)
    )
    if (downloadResult.isErr()) return err(downloadResult.error)

    try {
      const remotePayload = JSON.parse(downloadResult.value as string) as SyncPayload
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
  }

  private _mapError(e: any): SyncError {
    if (e.status === 401 || e.status === 403) {
      return new SyncAuthError('webdav', e.message || String(e), e)
    }
    return new SyncError('webdav', e.message || String(e), e)
  }
}
