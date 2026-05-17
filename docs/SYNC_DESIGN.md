# Chat Sync Design Document

**Feature:** Multi-backend chat synchronisation (GitHub, WebDAV, SFTP)  
**Repo:** BabaDeluxe/babadeluxe-webview  
**Status:** Design / Pre-implementation  
**Author:** simwai  

---

## 1. Goals & Non-Goals

### Goals

- Reliably sync local chats (stored in IndexedDB via `src/database/`) to at least one remote backend
- Support three backends: **GitHub** (Octokit REST), **WebDAV** (HTTP), **SFTP** (SSH — VS Code extension-host only)
- Offline-first: local is always the source of truth; sync is eventually consistent
- Single-user, multi-device: no collaborative editing required
- Reuse existing `src/retry.ts`, `src/errors.ts`, `src/error-mapper.ts`, and `src/services/` conventions

### Non-Goals

- Real-time multi-user collaborative editing (no OT / CRDTs needed)
- Binary attachment sync (images, files embedded in chats)
- Git history browsing via the GitHub backend

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Vue UI / Pinia Stores              │
│   (src/stores/)  ──► chat save ──► SyncManager       │
└───────────────────────────┬─────────────────────────┘
                             │ ISyncAdapter interface
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     GitHubSyncAdapter  WebDavSyncAdapter  SftpSyncAdapter
     (Octokit REST)     (fetch + WebDAV)   (postMessage bridge)
              │              │              │
              ▼              ▼              ▼
         GitHub repo     WebDAV server    VS Code ext-host
                                          (ssh2 / sftp)
```

**Key principle:** `SyncManager` only calls `ISyncAdapter`. Adding a new backend = implementing the interface, registering the adapter. Nothing else changes.

---

## 3. Data Model

### 3.1 Chat serialisation

Each chat is serialised to a single JSON file:

```
chats/
  <uuid>.json          ← one file per chat
  _manifest.json       ← index of all known chat UUIDs + versions
```

`_manifest.json` exists so a sync can detect deletions without fetching every file.

### 3.2 Chat envelope

```ts
interface SyncChatEnvelope {
  schemaVersion: 1
  id: string           // UUID v4, stable across devices
  version: number      // monotonically increasing integer, device-local counter
  updatedAt: string    // ISO 8601, informational only — NOT used for conflict resolution
  deviceId: string     // random UUID generated once per installation
  payload: Chat        // the actual chat data from src/database/
}
```

**Why `version` instead of `updatedAt` for conflicts?**  
Clocks skew. Two devices with clock drift > a few seconds will silently overwrite each other with timestamp-based LWW. A version counter incremented on every write is strictly monotonic per device and survives system clock changes.

### 3.3 Manifest

```ts
interface SyncManifest {
  schemaVersion: 1
  entries: Record<string, { version: number; deviceId: string; deletedAt?: string }>
}
```

---

## 4. ISyncAdapter Interface

```ts
// src/services/sync/i-sync-adapter.ts

export interface ISyncAdapter {
  readonly id: 'github' | 'webdav' | 'sftp'

  /** Test connectivity and auth. Throws SyncAuthError on 401/403. */
  connect(): Promise<void>

  /** Fetch remote manifest. Returns null if it doesn't exist yet. */
  fetchManifest(): Promise<SyncManifest | null>

  /** Upload manifest atomically. */
  putManifest(manifest: SyncManifest): Promise<void>

  /** Fetch a single chat by UUID. Returns null if not found. */
  fetchChat(id: string): Promise<SyncChatEnvelope | null>

  /** Upload a chat. Must be atomic (write-then-rename or equivalent). */
  putChat(envelope: SyncChatEnvelope): Promise<void>

  /** Delete a chat remotely. Soft-delete preferred (mark in manifest). */
  deleteChat(id: string): Promise<void>

  /** Disconnect / release resources (e.g. close SSH connection). */
  disconnect(): Promise<void>
}
```

---

## 5. SyncManager

```ts
// src/services/sync/sync-manager.ts

class SyncManager {
  private queue: SyncQueue       // persisted to IndexedDB
  private adapter: ISyncAdapter

  /** Called on app start and on a debounced timer after saves. */
  async sync(): Promise<SyncResult> {
    // 1. Drain pending queue items first (handles crash recovery)
    await this.drainQueue()

    // 2. Fetch remote manifest
    const remoteManifest = await this.adapter.fetchManifest() ?? emptyManifest()
    const localManifest  = await this.buildLocalManifest()

    // 3. Diff manifests → classify each chat
    const diff = diffManifests(localManifest, remoteManifest)
    //   diff.localOnly   → push to remote
    //   diff.remoteOnly  → pull from remote
    //   diff.conflict    → resolve (see §6)
    //   diff.inSync      → skip

    // 4. Push local-only chats
    for (const id of diff.localOnly) {
      await this.queue.enqueue({ op: 'put', id })
    }

    // 5. Pull remote-only chats
    for (const id of diff.remoteOnly) {
      const envelope = await this.adapter.fetchChat(id)
      await this.localDb.upsertChat(envelope)
    }

    // 6. Resolve conflicts
    for (const id of diff.conflict) {
      await this.resolveConflict(id, remoteManifest)
    }

    // 7. Update remote manifest
    await this.adapter.putManifest(localManifest)

    return buildResult(diff)
  }
}
```

### 5.1 SyncQueue (crash safety)

`SyncQueue` is an IndexedDB object store (`sync_queue`) with entries:

```ts
{ id: string; op: 'put' | 'delete'; retries: number; enqueuedAt: number }
```

On app start, `drainQueue()` replays any items that survived a crash before the previous sync completed.

---

## 6. Conflict Resolution

Two devices edited the same chat while offline. Strategy: **version-counter LWW with structural merge fallback**.

```
localVersion > remoteVersion  → keep local, push to remote
localVersion < remoteVersion  → keep remote, update local
localVersion === remoteVersion AND same deviceId → identical, skip
localVersion === remoteVersion AND different deviceId → structural merge
```

**Structural merge** (equal versions, different devices):

1. Merge message arrays by `message.id` (union, dedup)
2. For the chat `title`, keep the most recently `updatedAt` value (only field where timestamp is acceptable since it's human-readable, not a conflict gate)
3. Emit a `SyncConflictResolved` event so the UI can optionally toast the user

This covers ~99% of single-user multi-device scenarios without CRDTs.

---

## 7. Backend Implementations

### 7.1 GitHubSyncAdapter

**Library:** `@octokit/rest` (already a common dep in VS Code extensions)

```
Remote path:  <owner>/<repo>/chats/<uuid>.json
              <owner>/<repo>/chats/_manifest.json
```

- `putChat`: `GET` the file first to obtain its SHA, then `PUT` via `repos.createOrUpdateFileContents`. The SHA requirement enforces optimistic locking — a `409 Conflict` means another device pushed first; retry after fetching.
- `fetchManifest` / `putManifest`: same pattern.
- **Rate limits:** GitHub REST is 5,000 req/hr authenticated. With debounced sync (min 30s between full syncs), this is safe for realistic usage.
- **Auth:** Personal Access Token (PAT) with `repo` scope, stored via the existing `src/auth/` mechanism. Never committed to the repo.

### 7.2 WebDavSyncAdapter

**Library:** [`webdav`](https://github.com/perry-mitchell/webdav-client) (browser + Node compatible, ~30 KB)

```
Remote path:  <base-url>/chats/<uuid>.json
              <base-url>/chats/_manifest.json
```

- `putChat`: `LOCK` → `PUT` → `UNLOCK` sequence for servers that support WebDAV locking (Nextcloud, Apache). Fallback: `PUT` with `If-Match: <etag>` header for optimistic locking on servers without lock support (Nginx).
- `fetchManifest`: `PROPFIND` depth 0 to check existence, then `GET`.
- **Atomic write pattern:** Upload to `<uuid>.json.tmp`, then `MOVE` to `<uuid>.json` (WebDAV `MOVE` is atomic on most servers). Prevents partial reads.
- **Auth:** Basic auth or bearer token; credentials stored via `src/auth/`.

### 7.3 SftpSyncAdapter

**Runtime:** VS Code extension-host (Node.js) only — never runs in the webview sandbox.

**Architecture:** The webview sends `postMessage` requests to the extension host (same `src/vs-code/` bridge pattern already in use). The extension host owns the `ssh2`/`ssh2-sftp-client` connection and responds with serialised results.

```
Remote path:  <remote-dir>/chats/<uuid>.json
              <remote-dir>/chats/_manifest.json
```

- `putChat`: Upload to `<uuid>.json.tmp` via `fastPut`, then `rename` to `<uuid>.json`. SFTP `rename` is atomic on POSIX filesystems.
- No native locking — the manifest's version counter detects conflicts on next sync.
- **Connection lifecycle:** Open SSH connection on `connect()`, keep alive with periodic keepalive packets, close on `disconnect()`. Connection errors trigger a reconnect with exponential backoff via `src/retry.ts`.

---

## 8. Error Handling

Builds on `src/errors.ts` and `src/error-mapper.ts`:

| Error class | Examples | Action |
|---|---|---|
| `SyncAuthError` | HTTP 401, 403, SSH auth failure | Surface to UI immediately, disable sync, prompt re-auth. **Never retry.** |
| `SyncNetworkError` | Network timeout, ECONNREFUSED | Retry with exponential backoff (use `src/retry.ts`). Max 5 attempts. |
| `SyncConflictError` | GitHub SHA mismatch (409), WebDAV ETag mismatch | Fetch remote, resolve conflict, retry once. |
| `SyncDataError` | Corrupt JSON, schema version mismatch | Log, skip item, emit warning event. |
| `SyncStorageError` | IndexedDB write failure | Escalate to user — local DB is broken. |

All errors are logged via `src/logger.ts`. The Pinia sync store exposes a `syncStatus` reactive ref (`'idle' | 'syncing' | 'error' | 'conflict'`) for the UI.

---

## 9. File Structure

New files to create (all under `src/services/sync/`):

```
src/services/sync/
  i-sync-adapter.ts          ← interface + shared types
  sync-manager.ts            ← orchestration logic
  sync-queue.ts              ← IndexedDB-backed queue
  sync-errors.ts             ← SyncAuthError, SyncNetworkError, etc.
  manifest-differ.ts         ← diffManifests() pure function
  conflict-resolver.ts       ← structural merge logic
  adapters/
    github-sync-adapter.ts
    webdav-sync-adapter.ts
    sftp-sync-adapter.ts
src/stores/sync-store.ts     ← Pinia store: syncStatus, lastSyncAt, errors
```

No changes required to existing `src/database/`, `src/retry.ts`, or `src/errors.ts`.

---

## 10. Configuration (Settings)

Extend the existing settings model with a `sync` block:

```ts
interface SyncSettings {
  enabled: boolean
  backend: 'github' | 'webdav' | 'sftp' | null
  syncIntervalSeconds: number  // default: 300 (5 min); 0 = on-save only
  github?: {
    owner: string
    repo: string
    branch: string            // default: 'main'
    pat: string               // stored encrypted
  }
  webdav?: {
    url: string
    username: string
    password: string          // stored encrypted
  }
  sftp?: {
    host: string
    port: number              // default: 22
    username: string
    privateKeyPath: string    // extension-host path only
    remoteDir: string
  }
}
```

Credentials are **never** stored in plaintext in `localStorage` or `IndexedDB`. Use the VS Code `SecretStorage` API (extension-host) or the Web Crypto API (`AES-GCM`, key derived from a device-local secret) for the webview context.

---

## 11. Open Questions

| # | Question | Impact | Recommendation |
|---|---|---|---|
| 1 | Push-on-save (debounced) vs. fixed interval? | GitHub rate limits; UX responsiveness | Debounce 30s on-save + 5-min interval as fallback |
| 2 | Should sync settings live in the existing settings store or a dedicated Pinia store? | Code organisation | Dedicated `sync-store.ts` — keeps sync state (status, errors) separate from config |
| 3 | Scope: sync chats only, or also settings? | Complexity | Chats only in v1; settings sync is a separate feature |
| 4 | Encryption at rest on remote? | Privacy | Opt-in `AES-GCM` envelope wrapping before upload — design as a wrapper adapter (`EncryptedSyncAdapter`) |

---

## 12. Implementation Phases

**Phase 1 — Core + GitHub adapter** (highest value, lowest complexity)
- `ISyncAdapter`, `SyncManager`, `SyncQueue`, `manifest-differ`, `conflict-resolver`
- `GitHubSyncAdapter`
- `sync-store.ts` with basic UI indicators

**Phase 2 — WebDAV adapter**
- `WebDavSyncAdapter` with ETag optimistic locking
- Settings UI for WebDAV credentials

**Phase 3 — SFTP adapter**
- `SftpSyncAdapter` + extension-host bridge
- Extension-side SSH connection manager

**Phase 4 — Hardening**
- `EncryptedSyncAdapter` wrapper (opt-in AES-GCM)
- Conflict UI (toast with "remote won" / "local won" details)
- Unit tests for `manifest-differ` and `conflict-resolver` (pure functions, easy to test)
- Integration tests with a mock adapter
