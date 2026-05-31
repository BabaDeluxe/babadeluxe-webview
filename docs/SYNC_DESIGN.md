# Chat Sync Design Document

**Feature:** Multi-backend chat synchronisation (GitHub, WebDAV, SFTP)  
**Repo:** BabaDeluxe/babadeluxe-webview  
**Status:** Implemented (GitHub) / In Progress (WebDAV, SFTP)  
**Author:** simwai

---

## 1. Goals & Non-Goals

### Goals

- Reliably sync local chats (stored in IndexedDB via `src/database/`) to at least one remote backend
- Support three backends: **GitHub** (REST), **WebDAV** (HTTP), **SFTP** (SSH — VS Code extension-host only)
- Offline-first: local is always the source of truth; sync is eventually consistent
- Single-user, multi-device: no collaborative editing required
- Reuse existing `src/retry.ts`, `src/errors.ts`, `src/error-mapper.ts`, and `src/services/` conventions

### Non-Goals

- Real-time multi-user collaborative editing (no OT / CRDTs needed)
- Binary attachment sync (images, files embedded in chats)
- Git history browsing via the GitHub backend

---

## 2. Architecture Overview

````text
┌─────────────────────────────────────────────────────┐
│                    Vue UI / Pinia Stores              │
│   (src/stores/)  ──► chat save ──► SyncManager       │
└───────────────────────────┬─────────────────────────┘
                             │ ISyncAdapter interface
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     GitHubSyncAdapter  WebDavSyncAdapter  SftpSyncAdapter
     (fetch REST)        (webdav package)  (postMessage bridge)
              │              │              │
              ▼              ▼              ▼
         GitHub repo     WebDAV server    VS Code ext-host
                                          (ssh2 / sftp)
```text

**Key principle:** `SyncManager` only calls `ISyncAdapter`. Adding a new backend = implementing the interface, registering the adapter. Nothing else changes.

---

## 3. Data Model

### 3.1 Chat serialisation

Each chat is serialised to a single JSON file:

```text
chats/
  <conversationId>.json     ← one file per chat
```text

### 3.2 Sync Payload

The implementation uses a `SyncPayload` which includes both the conversation metadata and its messages.

```ts
export type SyncPayload = {
  syncId: string
  conversation: Conversation & { syncId: string; syncVersion: number }
  messages: Message[]
  syncVersion: number
  deviceId: string
  deletedAt?: string // ISO 8601 tombstone for deletions
}
```text

**Why `syncVersion` instead of `updatedAt` for conflicts?**
Clocks skew. Two devices with clock drift > a few seconds will silently overwrite each other with timestamp-based LWW. A version counter incremented on every write is strictly monotonic per device and survives system clock changes.

---

## 4. ISyncAdapter Interface

```ts
// src/sync/types.ts

export type ISyncAdapter = {
  readonly name: string
  push(payload: SyncPayload): Promise<Result<void, SyncError>>
  pull(since?: string): Promise<Result<SyncPayload[], SyncError>>
}
```text

All concrete adapters additionally implement, beyond the interface contract:

```ts
readonly backend: string          // machine-readable backend identifier
testConnection(): Promise<Result<void, SyncError>>
notifyDeleted(conversationId: number): Promise<Result<void, SyncError>>
```text

`testConnection` and `notifyDeleted` are called by the settings UI and sync-manager respectively but are not part of the minimal `ISyncAdapter` contract. Every adapter must implement them.

---

## 5. SyncManager

```ts
// src/sync/sync-manager.ts

class SyncManager {
  private _pending = new Map<number, PendingTimer>()
  private _adapter: ISyncAdapter | null = null

  /** Called on on-save or manual sync trigger. */
  async syncNow(): Promise<void> {
    // 1. Flush all pending pushes
    // ...
    // 2. Pull all remote payloads
    // ...
  }
}
```text

### 5.1 Pending Changes

Currently, pending changes are managed in-memory via a `_pending` map in `SyncManager`. Changes are debounced (2s) before being pushed to the remote adapter.

> **Note:** Persistent crash safety (via an IndexedDB-backed `SyncQueue`) is currently NOT implemented. If the app is closed while changes are pending, they will not be synced until the next manual or on-save trigger.

---

## 6. Conflict Resolution

Two devices edited the same chat while offline. Strategy: **version-counter LWW with structural merge fallback**.

```text
localVersion > remoteVersion  → keep local, push to remote
localVersion < remoteVersion  → keep remote, update local
localVersion === remoteVersion AND same deviceId → identical, skip
localVersion === remoteVersion AND different deviceId → structural merge
```text

**Structural merge** (equal versions, different devices):

1. Merge message arrays by `message.id` (union, dedup)
2. For the chat `title`, keep the most recently `updatedAt` value
3. Emit a `SyncConflictResolved` event so the UI can optionally toast the user

Conflict detection at the transport layer uses `ConflictError` from `src/errors.ts` (e.g. GitHub SHA mismatch, WebDAV ETag mismatch). These bubble up through the adapter's `push()` return type as a `SyncError` — the sync-manager catches them, triggers a re-pull, and retries once.

---

## 7. Backend Implementations

### 7.1 GitHubSyncAdapter

**Library:** native `fetch` (no Octokit dependency)

```text
Remote path:  <owner>/<repo>/chats/<conversationId>.json
```text

- `push`: checks for existing file SHA first, then `PUT` via `repos.createOrUpdateFileContents`. The SHA enforces optimistic locking — a `409` means another device pushed first; the adapter returns `err(new SyncError(...))` and the sync-manager re-pulls.
- `pull`: lists the `chats/` directory, downloads each `.json` file, returns `SyncPayload[]`.
- `testConnection`: `GET /repos/<owner>/<repo>` — success = reachable and auth valid.
- `notifyDeleted`: deletes the file via GitHub REST `DELETE`.
- **Rate limits:** GitHub REST is 5,000 req/hr authenticated. With debounced sync (min 30s between full syncs), this is safe for realistic usage.
- **Auth:** Personal Access Token (PAT) with `repo` scope, stored via the existing `src/auth/` mechanism.

### 7.2 WebDavSyncAdapter

**Library:** [`webdav`](https://github.com/perry-mitchell/webdav-client) (browser + Node compatible)

```text
Remote path:  <base-url>/chats/<conversationId>.json
```text

**Write strategy — temp-file atomic write + conditional PUT:**

1. Serialize `SyncPayload` to JSON.
2. `PUT` to `<conversationId>.json.tmp`.
   - If a prior ETag is known for `<conversationId>.json`, send `If-Match: <etag>` on this PUT.
   - `412 Precondition Failed` → fetch the remote file, return `err(new ConflictError(...))`.
   - `401`/`403` → return `err(new SyncAuthError('webdav', ...))`.
   - Network error → return `err(new SyncError('webdav', ...))`.
3. `MOVE` `<conversationId>.json.tmp` → `<conversationId>.json` (atomic on most WebDAV servers).

> **Note:** `LOCK`/`UNLOCK` is not used. The temp-file + MOVE pattern provides crash-safe atomicity without requiring server-side locking support (Nextcloud, Nginx WebDAV, Apache with or without locking module all support MOVE).

- `pull`: `PROPFIND /chats/` to list `.json` files. If `since` (ISO timestamp) is provided, filter by `lastmodified` property. Download and parse each as `SyncPayload`.
- `testConnection`: `PROPFIND <base-url>/chats/` depth 0. `ok(undefined)` on success; `err(new SyncAuthError(...))` on 401/403; `err(new SyncError(...))` otherwise.
- `notifyDeleted`: `DELETE <conversationId>.json`.
- **No LOCK/UNLOCK** — not required and reduces compatibility surface.
- **Auth:** Basic auth via `webdav` client constructor (`{ username, password }`).

### 7.3 SftpSyncAdapter

**Runtime:** Webview only — pure `postMessage` proxy. No SSH, no filesystem, no network in the webview.

**Architecture:** The webview sends typed `SftpSyncRequest` messages to the extension host via `src/vs-code/api.ts`. The extension host owns the `ssh2` connection and replies with `SftpSyncResponse` messages. The adapter listens for the matching `requestId`.

```text
Remote path:  <remote-dir>/chats/<conversationId>.json  (managed by extension host)
```text

**Message types** (defined in `src/vs-code/types.ts`):

```ts
// Webview → Extension host
export type SftpSyncRequest = Readonly<{
  type: 'sftp:sync:request'
  requestId: string
  op: 'push' | 'pull' | 'delete' | 'testConnection'
  payload?: SyncPayload // present for 'push'
  conversationId?: number // present for 'delete'
  since?: string // present for 'pull'
}>

// Extension host → Webview
export type SftpSyncResponse = Readonly<{
  type: 'sftp:sync:response'
  requestId: string
  error?: string
  payloads?: SyncPayload[] // present for 'pull' response
}>
```text

`SftpSyncResponse` is included in the `IncomingMessage` union.

**Every adapter method follows this round-trip pattern:**

1. Generate `requestId = crypto.randomUUID()`.
2. Post `SftpSyncRequest` via `src/vs-code/api.ts`.
3. Register a one-time `sftp:sync:response` listener matching `requestId`.
4. 30-second timeout → `err(new SyncError('sftp', 'Request timed out'))`.
5. Response with `error` → `err(new SyncError('sftp', response.error))`.
6. Clean response → `ok(...)`.

Specific op mappings:

| Method              | op               | extra fields         | success return                |
| ------------------- | ---------------- | -------------------- | ----------------------------- |
| `push(payload)`     | `push`           | `payload`            | `ok(undefined)`               |
| `pull(since?)`      | `pull`           | `since`              | `ok(response.payloads ?? [])` |
| `notifyDeleted(id)` | `delete`         | `conversationId: id` | `ok(undefined)`               |
| `testConnection()`  | `testConnection` | —                    | `ok(undefined)`               |

**Extension-host follow-up** (`babadeluxe-vscode` — separate task, not in this repo):

- `pnpm add ssh2` + add to `bundleDependencies`
- `pnpm add -D @types/ssh2`
- Do **not** install `cpu-features` or `sshcrypto` — they are native Node addons incompatible with Electron's ABI
- Extension-host handler listens for `sftp:sync:request`, executes via `ssh2-sftp-client`, replies with `sftp:sync:response`

---

## 8. Error Handling

Builds on `src/errors.ts`. The following sync-relevant error classes exist:

| Error class     | When used                                                    | Action                                                                    |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `SyncAuthError` | HTTP 401/403, SSH auth failure                               | Surface to UI immediately, disable sync, prompt re-auth. **Never retry.** |
| `SyncError`     | Network timeout, server errors, parse failures, SFTP timeout | Retry with exponential backoff via `src/retry.ts`. Max 5 attempts.        |
| `ConflictError` | GitHub SHA mismatch, WebDAV ETag `412`                       | Fetch remote, run conflict resolver (§6), retry push once.                |

> **No additional error subclasses are defined for sync.** Only `SyncError`, `SyncAuthError`, and `ConflictError` from `src/errors.ts` are used. Do not introduce `SyncNetworkError`, `SyncConflictError`, `SyncDataError`, or similar.

All errors are logged via `src/logger.ts`. The Pinia sync store exposes a `syncStatus` reactive ref (`'idle' | 'syncing' | 'error' | 'conflict'`) for the UI.

---

## 9. File Structure

```text
src/sync/
  types.ts                   ← ISyncAdapter interface + shared types
  sync-manager.ts            ← orchestration logic
  sync-queue.ts              ← (Reserved for future use/Refactoring)
  device-id.ts               ← Device identification service
  github-adapter.ts          ← GitHub REST API adapter (Phase 1 ✅)
  webdav-adapter.ts          ← WebDAV adapter (Phase 2)
  sftp-adapter.ts            ← SFTP postMessage proxy adapter (Phase 3)

src/vs-code/
  types.ts                   ← Includes SftpSyncRequest + SftpSyncResponse (Phase 3)
  api.ts                     ← VS Code postMessage bridge (existing, not modified)

src/stores/
  use-sync-store.ts          ← Pinia store: syncStatus, lastSyncAt, errors
```text

No changes required to `sync-manager.ts`, `github-adapter.ts`, `types.ts`, or any Vue component.

---

## 10. Configuration (Settings)

Extend the existing settings model with a `sync` block:

```ts
interface SyncSettings {
  enabled: boolean
  backend: 'github' | 'webdav' | 'sftp' | null
  syncIntervalSeconds: number // default: 300 (5 min); 0 = on-save only
  github?: {
    owner: string
    repo: string
    branch: string // default: 'main'
    pat: string // stored encrypted
  }
  webdav?: {
    url: string
    username: string
    password: string // stored encrypted
  }
  sftp?: {
    host: string
    port: number // default: 22
    username: string
    password: string // stored encrypted; extension-host uses this for SSH password auth
    remoteDir: string
  }
}
```text

> **Note:** SFTP uses password-based SSH auth (`username` + `password`). Private key auth is not in scope for the current implementation. Credentials are **never** stored in plaintext — use the VS Code `SecretStorage` API (extension-host) or Web Crypto `AES-GCM` (webview context).

---

## 11. Open Questions

| #   | Question                                                                             | Impact                                | Recommendation                                                                                          |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Push-on-save (debounced) vs. fixed interval?                                         | GitHub rate limits; UX responsiveness | Debounce 30s on-save + 5-min interval as fallback                                                       |
| 2   | Should sync settings live in the existing settings store or a dedicated Pinia store? | Code organisation                     | Dedicated `sync-store.ts` — keeps sync state (status, errors) separate from config                      |
| 3   | Scope: sync chats only, or also settings?                                            | Complexity                            | Chats only in v1; settings sync is a separate feature                                                   |
| 4   | Encryption at rest on remote?                                                        | Privacy                               | Opt-in `AES-GCM` envelope wrapping before upload — design as a wrapper adapter (`EncryptedSyncAdapter`) |

---

## 12. Implementation Phases

**Phase 1 — Core + GitHub adapter** (✅ COMPLETED)

- `ISyncAdapter`, `SyncManager`, `SyncQueue`, `conflict-resolver`
- `GitHubSyncAdapter`
- `use-sync-store.ts` with basic UI indicators

**Phase 2 — WebDAV adapter** (🔄 IN PROGRESS)

- `WebDavSyncAdapter` with temp-file atomic write + ETag conditional PUT
- `webdav` npm package as HTTP client
- Settings UI for WebDAV credentials

**Phase 3 — SFTP adapter** (🔄 IN PROGRESS)

- `SftpSyncAdapter` — pure postMessage proxy in the webview
- `SftpSyncRequest` / `SftpSyncResponse` message types in `src/vs-code/types.ts`
- Extension-host SSH handler lives in `babadeluxe-vscode` (separate task)

**Phase 4 — Hardening**

- `EncryptedSyncAdapter` wrapper (opt-in AES-GCM)
- Conflict UI (toast with "remote won" / "local won" details)
- Unit tests for `manifest-differ` and `conflict-resolver` (pure functions, easy to test)
- Integration tests with a mock adapter
````
