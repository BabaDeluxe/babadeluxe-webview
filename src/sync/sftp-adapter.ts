import { ok, err, ResultAsync, type Result } from 'neverthrow'
import { SyncError } from '@/errors'
import type { ISyncAdapter, SyncPayload } from '@/sync/types'
import type { SftpSyncRequest, SftpSyncResponse } from '@/vs-code/types'
import { postMessageToVsCode } from '@/vs-code/api'

export class SFTPSyncAdapter implements ISyncAdapter {
  readonly name = 'sftp'
  readonly backend = 'sftp' as const
  private readonly _pending = new Map<string, (r: SftpSyncResponse) => void>()

  constructor(private readonly _config: {
    host: string; port: number; username: string; password: string
  }) {
    window.addEventListener('message', (event) => {
      const message = event.data as SftpSyncResponse
      if (message && message.type === 'sftp:sync:response' && message.requestId) {
        const resolve = this._pending.get(message.requestId)
        if (resolve) {
          resolve(message)
        }
      }
    })
  }

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const res = await this._request({ op: 'push', payload })
    if (res.isErr()) return err(res.error)
    if (res.value.error) return err(new SyncError('sftp', res.value.error))
    return ok(undefined)
  }

  async pull(since?: string): Promise<Result<SyncPayload[], SyncError>> {
    const res = await this._request({ op: 'pull', since })
    if (res.isErr()) return err(res.error)
    if (res.value.error) return err(new SyncError('sftp', res.value.error))
    return ok(res.value.payloads ?? [])
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    const res = await this._request({ op: 'testConnection' })
    if (res.isErr()) return err(res.error)
    if (res.value.error) return err(new SyncError('sftp', res.value.error))
    return ok(undefined)
  }

  async notifyDeleted(conversationId: number): Promise<Result<void, SyncError>> {
    const res = await this._request({ op: 'delete', conversationId })
    if (res.isErr()) return err(res.error)
    if (res.value.error) return err(new SyncError('sftp', res.value.error))
    return ok(undefined)
  }

  private _request(req: Omit<SftpSyncRequest, 'requestId' | 'type'>): ResultAsync<SftpSyncResponse, SyncError> {
    return ResultAsync.fromPromise(
      new Promise<SftpSyncResponse>((resolve, reject) => {
        const requestId = crypto.randomUUID()
        const timer = setTimeout(() => {
          this._pending.delete(requestId)
          reject(new Error('Request timed out'))
        }, 30_000)

        this._pending.set(requestId, (response) => {
          clearTimeout(timer)
          this._pending.delete(requestId)
          resolve(response)
        })

        try {
          postMessageToVsCode({
            ...req,
            type: 'sftp:sync:request',
            requestId
          } as SftpSyncRequest)
        } catch (e) {
          clearTimeout(timer)
          this._pending.delete(requestId)
          reject(e)
        }
      }),
      (e) => new SyncError('sftp', e instanceof Error ? e.message : String(e))
    )
  }
}
