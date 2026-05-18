import { ok, err, ResultAsync } from 'neverthrow'
import type { Result } from 'neverthrow'
import type { ISyncAdapter, SyncPayload } from './types'
import { SyncError, SyncAuthError } from './types'

/**
 * GitHubSyncAdapter
 *
 * One conversation = one file:  <repo>/<basePath>/<syncId>.json
 *
 * Push strategy — "upsert with version guard":
 *   1. GET existing file to obtain its blob SHA and current syncVersion.
 *   2. If remote syncVersion > local: skip (another device is ahead; pull handles it).
 *   3. PUT with the blob SHA so GitHub rejects concurrent conflicting writes (412).
 *
 * Pull strategy:
 *   List directory → fetch each file via download_url (CDN, does not count against
 *   the 5 000 req/hr API rate limit for file reads).
 *
 * Error classification:
 *   401 / 403 (non-rate-limit) → SyncAuthError (non-retryable, stops SyncQueue retry loop)
 *   403 with x-ratelimit-remaining=0, 429  → SyncError (retryable via retryWithBackoff)
 *   All other non-2xx              → SyncError (retryable)
 */

export type GitHubAdapterConfig = {
  /** PAT with contents:write (fine-grained) or repo (classic) scope */
  token: string
  owner: string
  repo: string
  /** Folder inside the repo, e.g. "babadeluxe-sync" */
  basePath: string
  /** Defaults to "dev" to match this project's default branch */
  branch?: string
}

const API = 'https://api.github.com'

export class GitHubSyncAdapter implements ISyncAdapter {
  readonly name = 'github'
  private readonly _branch: string

  constructor(private readonly _config: GitHubAdapterConfig) {
    this._branch = _config.branch ?? 'dev'
  }

  isAvailable(): boolean {
    const { token, owner, repo, basePath } = this._config
    return !!(token && owner && repo && basePath)
  }

  // ─── Push ─────────────────────────────────────────────────────────────────────

  async push(payloads: SyncPayload[]): Promise<Result<void, SyncError>> {
    for (const payload of payloads) {
      const result = await this._upsertFile(payload)
      if (result.isErr()) return err(result.error)
    }
    return ok(undefined)
  }

  private async _upsertFile(payload: SyncPayload): Promise<Result<void, SyncError>> {
    const url = `${API}/repos/${this._config.owner}/${this._config.repo}/contents/${this._filePath(payload.syncId)}`

    const getResult = await this._getFile(url)
    if (getResult.isErr()) return err(getResult.error)
    const existing = getResult.value

    // Version guard: skip if remote is strictly newer
    if (existing) {
      let remoteVersion = 0
      try {
        const decoded = JSON.parse(
          atob(existing.content.replace(/\n/g, ''))
        ) as Partial<SyncPayload>
        remoteVersion = decoded.syncVersion ?? 0
      } catch {
        // Corrupt remote file — overwrite
      }
      if (remoteVersion > payload.syncVersion) return ok(undefined)
    }

    const body: Record<string, unknown> = {
      message: `sync: update ${payload.syncId.slice(0, 8)}`,
      content: btoa(JSON.stringify(payload)),
      branch: this._branch,
    }
    if (existing?.sha) body['sha'] = existing.sha

    const putResult = await ResultAsync.fromPromise(
      this._fetch(url, 'PUT', body),
      (e) => new SyncError('GitHub PUT network error', e instanceof Error ? e : undefined)
    )
    if (putResult.isErr()) return err(putResult.error)

    const res = putResult.value
    if (res.ok || res.status === 201) return ok(undefined)
    return err(await this._httpError(res))
  }

  // ─── Pull ─────────────────────────────────────────────────────────────────────

  async pull(): Promise<Result<SyncPayload[], SyncError>> {
    const url = `${API}/repos/${this._config.owner}/${this._config.repo}/contents/${this._config.basePath}?ref=${this._branch}`

    const listResult = await ResultAsync.fromPromise(
      this._fetch(url, 'GET'),
      (e) => new SyncError('GitHub list network error', e instanceof Error ? e : undefined)
    )
    if (listResult.isErr()) return err(listResult.error)

    const res = listResult.value
    if (res.status === 404) return ok([]) // Folder doesn't exist yet — first push hasn't happened
    if (!res.ok) return err(await this._httpError(res))

    let files: Array<{ name: string; download_url: string }>
    try {
      files = await res.json()
    } catch (e) {
      return err(new SyncError('GitHub pull: failed to parse directory listing', e instanceof Error ? e : undefined))
    }

    const payloads: SyncPayload[] = []
    for (const file of files) {
      if (!file.name.endsWith('.json')) continue

      const fetchResult = await ResultAsync.fromPromise(
        fetch(file.download_url, { headers: this._headers() }).then(
          (r) => r.json() as Promise<SyncPayload>
        ),
        (e) => new SyncError(`GitHub pull: failed to fetch ${file.name}`, e instanceof Error ? e : undefined)
      )
      if (fetchResult.isErr()) return err(fetchResult.error)
      payloads.push(fetchResult.value)
    }

    return ok(payloads)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private _filePath(syncId: string): string {
    return `${this._config.basePath}/${syncId}.json`
  }

  private _headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this._config.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private _fetch(url: string, method: string, body?: unknown): Promise<Response> {
    return fetch(url, {
      method,
      headers: this._headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  }

  private async _getFile(
    url: string
  ): Promise<Result<{ sha: string; content: string } | null, SyncError>> {
    const result = await ResultAsync.fromPromise(
      this._fetch(`${url}?ref=${this._branch}`, 'GET'),
      (e) => new SyncError('GitHub GET network error', e instanceof Error ? e : undefined)
    )
    if (result.isErr()) return err(result.error)

    const res = result.value
    if (res.status === 404) return ok(null)
    if (!res.ok) return err(await this._httpError(res))

    try {
      const data = (await res.json()) as { sha: string; content: string }
      return ok(data)
    } catch (e) {
      return err(new SyncError('GitHub GET: failed to parse response', e instanceof Error ? e : undefined))
    }
  }

  private async _httpError(res: Response): Promise<SyncError> {
    const body = await res.text().catch(() => '')
    if (res.status === 401) return new SyncAuthError(`GitHub 401 Unauthorized: ${body}`)
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        return new SyncError(`GitHub rate limit hit — will retry after reset`)
      }
      return new SyncAuthError(`GitHub 403 Forbidden: ${body}`)
    }
    return new SyncError(`GitHub HTTP ${res.status}: ${body}`)
  }
}
