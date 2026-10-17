# Chat Sync Design Document (Corrected)

**Feature:** Multi-backend chat synchronisation (WebDAV, SFTP)
**Repo:** BabaDeluxe/babadeluxe-webview
**Status:** In Progress (WebDAV, SFTP)
**Author:** simwai

---

## 1. Goals & Non-Goals

### Goals

- Reliably sync local chats (stored in IndexedDB via `src/database/`) to at least one remote backend
- Support backends: **WebDAV** (HTTP), **SFTP** (SSH — VS Code extension-host only)
- Offline-first: local is always the source of truth; sync is eventually consistent
- Single-user, multi-device: no collaborative editing required
- Reuse existing `src/retry.ts`, `src/errors.ts`, `src/error-mapper.ts`, and `src/services/` conventions

### Non-Goals

- Real-time multi-user collaborative editing (no OT / CRDTs needed)
- Binary attachment sync (images, files embedded in chats)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Vue UI / Pinia Stores              │
│   (src/stores/)  ──► chat save ──► SyncManager       │
└───────────────────────────┬─────────────────────────┘
                             │ ISyncAdapter interface
              ┌──────────────┴──────────────┐
              ▼                             ▼
     WebDavSyncAdapter                SftpSyncAdapter
     (webdav package)                 (postMessage bridge)
              │                             │
              ▼                             ▼
         WebDAV server                VS Code ext-host
                                      (ssh2 / sftp)
```

**Key principle:** `SyncManager` only calls `ISyncAdapter`. Adding a new backend = implementing the interface, registering the adapter. Nothing else changes.

---

## 3. Data Model

### 3.1 Chat serialisation

Each chat is serialised to a single JSON file:

```
chats/
  <conversationId>.json     ← one file per chat (live or tombstone)
```

### 3.2 Sync Payload

```ts
export type VersionVector = Record<string, number> // deviceId → counter

export type SyncPayload = {
  syncId: string
  conversation: Conversation & { syncId: string }
  messages: Message[]
  version: VersionVector
  deviceId: string
  updatedAt: string          // ISO 8601, informational only
  deletedAt?: string         // ISO 8601 tombstone; when set, messages is []
}
```

### 3.3 Why a version vector, not a scalar counter

A per-device scalar counter is monotonic **on that device only**. Device A at `100` and Device B at `3` are not comparable — B may have edited more recently. Cross-device LWW on scalar counters silently loses writes.

A version vector (`deviceId → counter`) is globally comparable:

- `a` dominates `b` if `∀k: a[k] ≥ b[k]` and `∃k: a[k] > b[k]` → keep `a`
- `a` equals `b` if they have identical entries → no-op
- otherwise → **concurrent** → structural merge (§6)

Each device increments only its own key on write, then sends the full vector.

### 3.4 Tombstones

Deletion is a **soft delete**. On delete, the device:

1. Sets `deletedAt`, clears `messages`, bumps its own version key
2. Pushes the tombstone payload to the remote

The remote file is **never removed** during normal sync. Other devices pull the tombstone and delete locally. `notifyDeleted(conversationId)` means "publish a tombstone for this id", not "DELETE the remote file".

> **GC (future work):** tombstones can be pruned once every known device's vector dominates the tombstone's vector, or after N days. Not implemented in v1 — tombstones are retained indefinitely.

---

## 4. ISyncAdapter Interface

```ts
// src/sync/types.ts

export type SyncOperationError = SyncError | SyncAuthError | ConflictError

export type ISyncAdapter = {
  readonly name: string
  readonly backend: string      // machine-readable backend identifier

  push(payload: SyncPayload): Promise<Result<void, SyncOperationError>>
  pull(since?: string): Promise<Result<SyncPayload[], SyncOperationError>>

  /** Publish a tombstone for the given conversation. */
  notifyDeleted(conversationId: number): Promise<Result<void, SyncOperationError>>

  testConnection(): Promise<Result<void, SyncAuthError | SyncError>>
}
```

All four methods are part of the contract. There is no separate "extended" surface — adapters that cannot implement one of these are not valid adapters.

`SyncAuthError` and `ConflictError` must either extend `SyncError` or be explicitly unioned in the return type (as above). The union form is used here so that each error remains a distinct class for `instanceof` checks in the sync-manager.

---

## 5. SyncManager

```ts
// src/sync/sync-manager.ts

class SyncManager {
  private _pending = new Map<number, PendingTimer>()
  private _adapter: ISyncAdapter | null = null

  async syncNow(): Promise<void> {
    // 1. Flush all pending pushes
    // 2. Pull all remote payloads
    // 3. Reconcile (see §6)
  }
}
```

### 5.1 Pending changes

Pending changes are tracked in-memory in `_pending` and debounced (2s) before push.

> **Note:** Persistent crash safety (IndexedDB-backed `SyncQueue`) is not implemented in v1. `src/sync/sync-queue.ts` is a placeholder reserved for this refactor.

---

## 6. Conflict Resolution

Given a local payload `L` and remote payload `R` for the same `syncId`:

```
L.version dominates R.version        → keep local, push to remote
R.version dominates L.version        → keep remote, update local
L.version === R.version              → identical, skip
otherwise (concurrent)               → structural merge
```

**Structural merge (concurrent edits):**

1. Union `messages` by `message.id` (dedup by id; newest `updatedAt` wins on collision)
2. For `title` / metadata, keep the value from the payload with the newer `updatedAt`
3. Merge version vectors: `merged[d] = max(L[d], R[d])` for every device `d`
4. Bump the local device's key in the merged vector
5. Push the merged payload
6. Emit `SyncConflictResolved` so the UI can toast the user

**Deletion vs. edit:** if one side is a tombstone and the other is not, the tombstone wins only if its version dominates. If concurrent, **edit wins** (safer default — do not delete data the user may still want). Log the case.

Transport-level conflicts (`ConflictError`) are detected by the adapter (WebDAV `412`, SFTP version-mismatch response) and returned through `push()`. The sync-manager catches `ConflictError`, re-pulls, runs the resolver above, and retries once.

---

## 7. Backend Implementations

### 7.1 WebDavSyncAdapter

**Library:** [`webdav`](https://github.com/perry-mitchell/webdav-client)

```
Remote path:  <base-url>/chats/<conversationId>.json
```

**Write strategy — direct conditional PUT:**

1. Serialize `SyncPayload` to JSON.
2. `PUT` to `<conversationId>.json`:
   - If a prior ETag is known → send `If-Match: <etag>`.
   - If the file is known to not exist → send `If-None-Match: *`.
   - If no ETag is known and existence is unknown → first `HEAD`/`PROPFIND` to obtain the ETag, then PUT.
3. Response handling:
   - `412 Precondition Failed` → fetch the remote file, return `err(new ConflictError(...))`.
   - `401` / `403` → `err(new SyncAuthError('webdav', ...))`.
   - Other 4xx/5xx or network error → `err(new SyncError('webdav', ...))`.

> HTTP `PUT` is atomic per request, so **no temp-file + MOVE dance is used**. That pattern is only useful when you need crash-safety across multiple writes, which is not the case here. It also caused a correctness bug: `If-Match` on a PUT to `.tmp` checks the wrong resource, and `MOVE` does not conditionally check the destination.

- `pull(since?)`: `PROPFIND /chats/` depth 1, filter to `.json`, optionally filter by `lastmodified >= since`, download and parse each. Tombs are just payloads with `deletedAt` set.
- `testConnection()`: `PROPFIND <base-url>/chats/` depth 0. `ok(undefined)` on success; `SyncAuthError` on 401/403; `SyncError` otherwise.
- `notifyDeleted(id)`: build a tombstone payload locally, then call `push()` with it. **Do not DELETE the remote file.**
- **Auth:** Basic auth via the `webdav` client constructor.

### 7.2 SftpSyncAdapter

**Runtime:** Webview only — pure `postMessage` proxy. No SSH, no filesystem, no network in the webview.

**Architecture:** the webview sends typed `SftpSyncRequest` messages via `src/vs-code/api.ts`; the extension host owns the `ssh2` connection and replies with `SftpSyncResponse`. The adapter correlates replies by `requestId`.

```
Remote path:  <remote-dir>/chats/<conversationId>.json  (managed by extension host)
```

**Optimistic concurrency for SFTP:** the extension host performs read-check-write atomically within one request:

1. Read remote file (if any).
2. Compare remote `version` with `expectedVersion` supplied by the webview.
3. If remote dominates `expectedVersion` → reply `error: 'conflict'` and include the remote payload (or its version) so the sync-manager can resolve.
4. Otherwise write the new payload.

This makes SFTP concurrency equivalent to WebDAV's `If-Match` behaviour, without relying on SFTP server features.

**Message types** (`src/vs-code/types.ts`):

```ts
// Webview → Extension host
export type SftpSyncRequest = Readonly<{
  type: 'sftp:sync:request'
  requestId: string
  op: 'push' | 'pull' | 'delete' | 'testConnection'
  payload?: SyncPayload              // for 'push'
  expectedVersion?: VersionVector | null // for 'push' — null means "expect absent"
  conversationId?: number            // for 'delete'
  since?: string                     // for 'pull'
}>

// Extension host → Webview
export type SftpSyncResponse = Readonly<{
  type: 'sftp:sync:response'
  requestId: string
  error?: 'conflict' | 'auth' | 'network' | string
  remotePayload?: SyncPayload        // present on conflict, so the manager can merge
  payloads?: SyncPayload[]           // present for 'pull'
}>
```

`SftpSyncResponse` is part of the `IncomingMessage` union.

**Round-trip pattern for every adapter method:**

1. `requestId = crypto.randomUUID()`
2. Post `SftpSyncRequest` via `src/vs-code/api.ts`
3. Register a one-time `sftp:sync:response` listener matching `requestId`
4. 30-second timeout → `err(new SyncError('sftp', 'Request timed out'))`
5. Map response errors: `'conflict'` → `ConflictError` (with remote payload), `'auth'` → `SyncAuthError`, otherwise `SyncError`
6. Clean response → `ok(...)`

Op mapping:

| Method              | op               | extra fields                        | success return                |
| ------------------- | ---------------- | ----------------------------------- | ----------------------------- |
| `push(payload)`     | `push`           | `payload`, `expectedVersion`        | `ok(undefined)`               |
| `pull(since?)`      | `pull`           | `since`                             | `ok(response.payloads ?? [])` |
| `notifyDeleted(id)` | `push` (tombstone) | tombstone `payload`               | `ok(undefined)`               |
| `testConnection()`  | `testConnection` | —                                   | `ok(undefined)`               |

`notifyDeleted` reuses `push` with a tombstone payload so the remote file is preserved (per §3.4).

**Extension-host follow-up** (`babadeluxe-vscode` — separate task):

- `pnpm add ssh2` + add to `bundleDependencies`
- `pnpm add -D @types/ssh2`
- Do **not** install `cpu-features` or `sshcrypto` — native addons incompatible with Electron's ABI
- Handler listens for `sftp:sync:request`, executes via `ssh2-sftp-client`, replies with `sftp:sync:response`
- Must implement the read-check-write sequence described above

---

## 8. Error Handling

Builds on `src/errors.ts`.

| Error class     | When used                                                    | Action                                                                    |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `SyncAuthError` | HTTP 401/403, SSH auth failure                               | Surface to UI immediately, disable sync, prompt re-auth. **Never retry.** |
| `SyncError`     | Network timeout, server errors, parse failures, SFTP timeout | Retry with exponential backoff via `src/retry.ts`. Max 5 attempts.        |
| `ConflictError` | WebDAV ETag `412`, SFTP version-mismatch response            | Fetch remote, run conflict resolver (§6), retry push once.                |

> Only `SyncError`, `SyncAuthError`, and `ConflictError` from `src/errors.ts` are used for sync. Do not introduce `SyncNetworkError`, `SyncConflictError`, `SyncDataError`, or similar.

All errors are logged via `src/logger.ts`. The Pinia sync store exposes a `syncStatus` reactive ref (`'idle' | 'syncing' | 'error' | 'conflict'`) for the UI.

---

## 9. File Structure

```
src/sync/
  types.ts                   ← ISyncAdapter + VersionVector + SyncPayload + SyncOperationError
  sync-manager.ts            ← orchestration logic
  sync-queue.ts              ← placeholder (future crash-safe queue)
  device-id.ts               ← device identification service
  conflict-resolver.ts       ← pure version-comparison + structural merge
  webdav-adapter.ts          ← WebDAV adapter (Phase 1)
  sftp-adapter.ts            ← SFTP postMessage proxy adapter (Phase 2)

src/vs-code/
  types.ts                   ← SftpSyncRequest + SftpSyncResponse (Phase 2)
  api.ts                     ← VS Code postMessage bridge (existing, not modified)

src/stores/
  use-sync-store.ts          ← Pinia store: syncStatus, lastSyncAt, errors
```

No changes are required to `src/vs-code/api.ts` or any Vue component. `src/sync/types.ts` and `src/vs-code/types.ts` are additive.

---

## 10. Configuration (Settings)

```ts
interface SyncSettings {
  enabled: boolean
  backend: 'webdav' | 'sftp' | null
  syncIntervalSeconds: number // default 300; 0 = on-save only
  webdav?: {
    url: string
    username: string
    password: string // stored encrypted
  }
  sftp?: {
    host: string
    port: number // default 22
    username: string
    password: string // stored encrypted; SSH password auth only
    remoteDir: string
  }
}
```

> SFTP uses password-based SSH auth. Private-key auth is out of scope. Credentials are never stored in plaintext — use VS Code `SecretStorage` (extension host) or Web Crypto `AES-GCM` (webview).

---

## 11. Open Questions

| #   | Question                                                                             | Impact                | Recommendation                                                             |
| --- | ------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------- |
| 1   | Push-on-save (debounced) vs. fixed interval?                                         | Remote rate limits; UX | Debounce 30s on-save + 5-min interval as fallback                          |
| 2   | Sync settings in the existing settings store or a dedicated Pinia store?             | Code organisation     | Dedicated `sync-store.ts`                                                  |
| 3   | Scope: chats only, or also settings?                                                 | Complexity            | Chats only in v1                                                           |
| 4   | Encryption at rest on remote?                                                        | Privacy               | Opt-in `AES-GCM` envelope wrapper (`EncryptedSyncAdapter`)                 |
| 5   | Tombstone GC policy?                                                                 | Storage growth        | Defer; retain indefinitely in v1, revisit once multi-device telemetry exists |

---

## 12. Implementation Phases

**Phase 1 — WebDAV adapter** (🔄 IN PROGRESS)

- `WebDavSyncAdapter` with direct conditional PUT (`If-Match` / `If-None-Match`)
- `webdav` npm package as HTTP client
- `conflict-resolver.ts` with version-vector comparison + structural merge
- Settings UI for WebDAV credentials

**Phase 2 — SFTP adapter** (🔄 IN PROGRESS)

- `SftpSyncAdapter` — postMessage proxy with `expectedVersion` round-trip
- `SftpSyncRequest` / `SftpSyncResponse` in `src/vs-code/types.ts`
- Extension-host SSH handler in `babadeluxe-vscode` (separate task) — must implement read-check-write

**Phase 3 — Hardening**

- `EncryptedSyncAdapter` wrapper (opt-in AES-GCM)
- Conflict UI (toast with "remote won" / "local won" details)
- Unit tests for `conflict-resolver` (pure function, easy to test) and adapter request/response mapping
- Integration tests with a mock adapter covering: normal push/pull, concurrent edit, concurrent delete-vs-edit, tombstone pull