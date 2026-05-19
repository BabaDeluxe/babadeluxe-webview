import { ok, err, type Result } from 'neverthrow'
import { SyncError, SyncAuthError } from '@/errors'
import type {
  ISyncAdapter,
  ConversationSnapshot,
  ConversationSnapshotForUpload,
  SyncPayload,
} from '@/sync/types'
import type { DeviceIdService } from '@/sync/device-id'

const apiBase = 'https://api.github.com'
const filePrefix = 'chats/'
const fileExtension = '.json'

type GitHubAdapterConfig = {
  token: string
  owner: string
  repo: string
  branch?: string
}

type GitHubFileResponse = {
  content: string
  sha: string
  encoding: string
}

export class GitHubSyncAdapter implements ISyncAdapter {
  readonly name = 'github'
  readonly backend = 'github' as const
  private readonly _branch: string

  constructor(
    private readonly _config: GitHubAdapterConfig,
    private readonly _deviceIdService: DeviceIdService
  ) {
    this._branch = _config.branch ?? 'main'
  }

  async push(payload: SyncPayload): Promise<Result<void, SyncError>> {
    if (payload.deletedAt) {
      return this.remove(payload.conversation.id)
    }

    const snapshot: ConversationSnapshotForUpload = {
      id: payload.conversation.id,
      syncVersion: payload.syncVersion,
      conversation: payload.conversation,
      messages: payload.messages,
      deviceId: payload.deviceId,
    }

    return this.upload(snapshot)
  }

  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const listResult = await this.listRemote()
    if (listResult.isErr()) return err(listResult.error)

    const payloads: SyncPayload[] = []

    for (const { id, syncVersion } of listResult.value) {
      const downloadResult = await this.download(id)
      if (downloadResult.isErr()) return err(downloadResult.error)
      const snapshot = downloadResult.value
      if (!snapshot) continue

      const payload: SyncPayload = {
        syncId: `github:${id}`,
        conversation: {
          ...snapshot.conversation,
          syncId: `github:${id}`,
          syncVersion: snapshot.syncVersion,
        },
        messages: snapshot.messages,
        syncVersion,
        deviceId: snapshot.deviceId ?? this._deviceIdService.getOrCreate(),
      }

      payloads.push(payload)
    }

    return ok(payloads)
  }

  async testConnection(): Promise<Result<void, SyncError>> {
    const result = await this._get(`/repos/${this._config.owner}/${this._config.repo}`)
    if (result.isErr()) return err(result.error)
    return ok(undefined)
  }

  async upload(snapshot: ConversationSnapshotForUpload): Promise<Result<void, SyncError>> {
    const deviceId = snapshot.deviceId ?? this._deviceIdService.getOrCreate()

    const envelope: ConversationSnapshotForUpload = {
      ...snapshot,
      deviceId,
    }

    const path = this._filePath(envelope.id)
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(envelope, null, 2))))

    const existing = await this._getFileMeta(path)
    const sha = existing.isOk() ? existing.value : undefined

    const body: Record<string, unknown> = {
      message: `sync: update conversation ${envelope.id} (v${envelope.syncVersion})`,
      content,
      branch: this._branch,
    }
    if (sha) body.sha = sha

    const result = await this._put(
      `/repos/${this._config.owner}/${this._config.repo}/contents/${path}`,
      body
    )
    if (result.isErr()) return err(result.error)
    return ok(undefined)
  }

  async download(conversationId: number): Promise<Result<ConversationSnapshot | null, SyncError>> {
    const path = this._filePath(conversationId)
    const result = await this._get<GitHubFileResponse>(
      `/repos/${this._config.owner}/${this._config.repo}/contents/${path}?ref=${this._branch}`
    )

    if (result.isErr()) {
      if (result.error.message.includes('404')) return ok(null)
      return err(result.error)
    }

    try {
      const decoded = decodeURIComponent(escape(atob(result.value.content.replace(/\n/g, ''))))
      const snapshot = JSON.parse(decoded) as ConversationSnapshot
      return ok(snapshot)
    } catch (e) {
      return err(
        new SyncError(
          'github',
          `Failed to parse remote snapshot for conversation ${conversationId}`,
          e
        )
      )
    }
  }

  async remove(conversationId: number): Promise<Result<void, SyncError>> {
    const path = this._filePath(conversationId)
    const shaResult = await this._getFileMeta(path)
    if (shaResult.isErr()) {
      if (shaResult.error.message.includes('404')) return ok(undefined)
      return err(shaResult.error)
    }

    const result = await this._delete(
      `/repos/${this._config.owner}/${this._config.repo}/contents/${path}`,
      {
        message: `sync: delete conversation ${conversationId}`,
        sha: shaResult.value,
        branch: this._branch,
      }
    )
    if (result.isErr()) return err(result.error)
    return ok(undefined)
  }

  async listRemote(): Promise<
    Result<ReadonlyArray<{ id: number; syncVersion: number }>, SyncError>
  > {
    // eslint-disable-next-line
    const result = await this._get<Array<{ name: string; download_url: string }>>(
      `/repos/${this._config.owner}/${this._config.repo}/contents/${filePrefix.slice(0, -1)}?ref=${this._branch}`
    )

    if (result.isErr()) {
      if (result.error.message.includes('404')) return ok([])
      return err(result.error)
    }

    const entries: Array<{ id: number; syncVersion: number }> = []

    for (const file of result.value) {
      if (!file.name.endsWith(fileExtension)) continue
      const id = parseInt(file.name.replace(fileExtension, ''), 10)
      if (isNaN(id)) continue

      const downloadResult = await this.download(id)
      if (downloadResult.isErr() || !downloadResult.value) continue
      entries.push({ id, syncVersion: downloadResult.value.syncVersion })
    }

    return ok(entries)
  }

  private async _getFileMeta(path: string): Promise<Result<string, SyncError>> {
    const result = await this._get<GitHubFileResponse>(
      `/repos/${this._config.owner}/${this._config.repo}/contents/${path}?ref=${this._branch}`
    )
    if (result.isErr()) return err(result.error)
    return ok(result.value.sha)
  }

  private async _get<T>(endpoint: string): Promise<Result<T, SyncError>> {
    return this._request<T>('GET', endpoint)
  }

  private async _put(endpoint: string, body: unknown): Promise<Result<unknown, SyncError>> {
    return this._request('PUT', endpoint, body)
  }

  private async _delete(endpoint: string, body: unknown): Promise<Result<unknown, SyncError>> {
    return this._request('DELETE', endpoint, body)
  }

  private async _request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<Result<T, SyncError>> {
    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method,
        headers: {
          // eslint-disable-next-line
          Authorization: `Bearer ${this._config.token}`,
          // eslint-disable-next-line
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (res.status === 401 || res.status === 403) {
        return err(new SyncAuthError('github', `HTTP ${res.status}: ${await res.text()}`))
      }

      if (!res.ok) {
        return err(new SyncError('github', `HTTP ${res.status}: ${await res.text()}`))
      }

      if (res.status === 204) return ok(undefined as T)

      const data = (await res.json()) as T
      return ok(data)
    } catch (e) {
      return err(
        new SyncError('github', `Network error: ${e instanceof Error ? e.message : String(e)}`, e)
      )
    }
  }

  private _filePath(conversationId: number): string {
    return `${filePrefix}${conversationId}${fileExtension}`
  }
}
