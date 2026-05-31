# HTTP & Real-time Communication

All backend communication goes through Socket.io — there are no REST calls from the webview. This doc covers the socket layer, NeverThrow usage patterns, retry strategy, and the custom error hierarchy.

## Socket Architecture

`SocketManager` owns the single Socket.io connection for the lifetime of the app. It is instantiated once and provided via DI (`provide`/`safeInject`).

### Key design decisions

**Named internal handlers** — `_onConnect`, `_onDisconnect`, `_onConnectError` are stored as class fields so `disconnect()` can remove them by reference without disturbing app-registered handlers.

**`_connectingPromise` coalescing** — concurrent callers of `waitForConnection()` share a single promise. Without this, each caller races its own timeout against the same socket event.

**`io(this._baseUrl)`** — the base URL is passed at construction time, not hardcoded to `Root.path`. This allows the manager to be used against different environments without subclassing.

## `emitWithTimeout`

All socket emissions go through `emitWithTimeout`, which wraps the Socket.io callback-style API into a `ResultAsync<T, Error>`.

````ts
// WRONG — fromThrowable is for sync functions.
// It wraps the Promise itself as the Ok value instead of awaiting it.
const result = await ResultAsync.fromThrowable(emitPromise, mapError)()

// CORRECT — fromPromise awaits the already-constructed Promise.
const result = await ResultAsync.fromPromise(emitPromise, mapError)
```text

The `||` → `??` change in the error fallback is intentional: `||` would swallow a valid `0` or `false` error value; `??` only falls back on `null`/`undefined`.

## Retry Strategy

`retryWithBackoff` protects critical network operations (model listing, message sending) with exponential backoff and jitter.

```ts
export async function retryWithBackoff<T, E>(
  operation: () => Promise<Result<T, E | RateLimitError>>,
  context: string,
  config: Partial<RetryConfig> = {}
): Promise<Result<T, E | RateLimitError>>
```text

### Config defaults

| Option                     | Default  | Notes                                                    |
| :------------------------- | :------- | :------------------------------------------------------- |
| `maxRetries`               | `5`      | Must be > 0 or the function returns an error immediately |
| `initialDelayMilliseconds` | `1000`   | First retry delay                                        |
| `backoffMultiplier`        | `2`      | Exponential factor                                       |
| `maxDelayMilliseconds`     | `16_000` | Cap to avoid unbounded waits                             |

Only `RateLimitError` triggers a retry. Any other error type short-circuits immediately — no point retrying a validation error.

### Jitter

```ts
const jitter = Math.random() * 0.3 * exponentialDelay
const delay = Math.min(exponentialDelay + jitter, maxDelayMilliseconds)
```text

Jitter is up to 30% of the base delay, preventing thundering herd on concurrent retries.

## Error Hierarchy

```text
Error
└── AppError (base)
    ├── DbError                  — IndexedDB / Dexie failures
    ├── SocketError              — Socket.io connection / emission failures
    ├── RateLimitError           — 429 / rate limit from provider
    ├── ChatError                — Business logic failures in conversation flow
    ├── MessageNotFoundError     — Message ID missing from local state
    ├── MessageCreationError     — Failed to persist a new message
    ├── MessageUpdateError       — Failed to update an existing message
    ├── NetworkError             — Generic network layer failures
    └── ValidationError          — Zod schema mismatch at runtime
```text

Every error class carries a `cause?: unknown` for wrapping lower-level errors without losing the original stack. Consumer code matches on the class type — no string comparison on `error.message`.

## NeverThrow Usage Rules

- All async operations return `Result<T, E>` or `ResultAsync<T, E>` — never `throw`
- Use `ResultAsync.fromPromise(promise, mapError)` for already-constructed Promises
- Use `Result.fromThrowable(syncFn, mapError)` for synchronous functions that might throw
- Use `.match()` or `.isErr()` at call sites — never access `.value` without checking
- Chain with `.andThen()` / `.map()` — avoid nested `if (result.isOk())` pyramids
````
