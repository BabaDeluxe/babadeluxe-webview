# Error Handling Guideline

This document guides you on how to handle errors, create custom error types, and log effectively within our existing application.

## ⛔ ABSOLUTE PROHIBITIONS

**Read these first. These rules have ZERO exceptions.**

### 1. NEVER Use `new Error()`

The generic `Error` class is **banned**. Every error must be a domain error.

❌ **FORBIDDEN:**

```typescript
throw new Error('Something failed')
return err(new Error('Invalid input'))
const result = await ResultAsync.fromPromise(api.call(), (e) => new Error('API failed'))
```

✅ **REQUIRED:**

```typescript
return err(new NetworkError('Something failed'))
return err(new ValidationError('Invalid input'))
const result = await ResultAsync.fromPromise(api.call(), (e) => new NetworkError('API failed', e))
```

**If you see `new Error()` in code, reject it immediately.**

---

### 2. NEVER Use `as Error`

`BaseError` accepts `unknown` for the `cause` parameter. **You never need to cast.**

❌ **FORBIDDEN:**

```typescript
(e) => new NetworkError('Failed', e as Error)
(e) => new DbError('Failed', e as unknown as Error)
```

✅ **REQUIRED:**

```typescript
(e) => new NetworkError('Failed', e)
(e) => new DbError('Failed', e)
```

**BaseError handles the type uncertainty internally. Your code stays clean.**

---

### 3. NEVER Return `ResultAsync`

Functions must return `Promise<Result<T, E>>`, not `ResultAsync<T, E>`.

❌ **FORBIDDEN:**

```typescript
async function fetchData(): ResultAsync<Data, NetworkError> { ... }
```

✅ **REQUIRED:**

```typescript
async function fetchData(): Promise<Result<Data, NetworkError>> { ... }
```

---

### 4. NEVER Use Chaining Methods

Do **not** use these `neverthrow` methods. They hide control flow and make debugging harder.

❌ **FORBIDDEN:**

- `result.map()`
- `result.mapErr()`
- `result.andThen()`
- `result.orElse()`

✅ **REQUIRED:**

```typescript
// Use explicit if checks
const validateResult = validate(input)
if (validateResult.isErr()) {
  return err(validateResult.error)
}

const fetchResult = await fetchData(validateResult.value)
if (fetchResult.isErr()) {
  return err(fetchResult.error)
}

return ok(transform(fetchResult.value))
```

---

## 1. Where to Log: The Boundary Principle

**Default Rule:** Propagate errors up to views (the boundary) and log **once** there with full context.

### ✅ Views Log (Default Case)

Views are boundaries—they have:

- User context (which button, which screen, which user)
- Business operation context (saving settings, deleting conversation)
- Correlation IDs (session, request tracking)

Log **once** in the view with enriched context that tells the complete story.

```typescript
// ✅ View logs with full context
async function handleDeleteConversation(id: string) {
  const result = await deleteConversation(id)

  if (result.isErr()) {
    logger.error('Conversation deletion failed', {
      conversationId: id,
      userId: currentUser.value?.id,
      operation: 'handleDeleteConversation',
      error: result.error.message,
      cause: result.error.cause,
    })
    showAlert('Failed to delete conversation')
    return
  }

  logger.info('Conversation deleted', { conversationId: id })
}
```

### ⚠️ Composables Log (Exception Cases Only)

Composables should **NOT** log by default. They return `Result<T, E>` so the caller can decide.

**Only log in composables if:**

1. **Fire-and-forget operations:** No caller will log (e.g., cross-tab sync, background cleanup)
2. **Long-running background tasks:** WebSocket reconnects, polling loops, event listeners
3. **App-critical initialization:** Database setup, config loading at startup that blocks the entire app

**Rule of Thumb:** If your composable **returns a `Result<T, E>`**, the caller will handle it—**don't log**. If it returns `void` or is fire-and-forget, **log it**.

---

## 2. BaseError Implementation

All custom errors **must** extend `BaseError`. Here's the required implementation:

```typescript
// src/base-error.ts
export class BaseError extends Error {
  public readonly namespace: string

  constructor(
    message: string,
    public override readonly cause?: unknown,
    public readonly namespaceOverride?: string
  ) {
    const namespace = namespaceOverride ?? new.target.name.replace(/Error$/, '')
    super(`[${namespace}] ${message}`)
    this.name = new.target.name
    this.namespace = namespace
    Object.setPrototypeOf(this, new.target.prototype)
  }

  public override toString(): string {
    let output = this.stack ?? `${this.name}: ${this.message}`

    if (this.cause !== undefined) {
      const causeString = this.formatCause(this.cause)
      output += `\n\nCaused by:\n${causeString}`
    }

    return output
  }

  private formatCause(cause: unknown): string {
    if (cause instanceof Error) {
      return cause.stack ?? `${cause.name}: ${cause.message}`
    }

    if (typeof cause === 'string') {
      return cause
    }

    if (typeof cause === 'object' && cause !== null) {
      try {
        return JSON.stringify(cause, null, 2)
      } catch {
        return '[Unserializable Object]'
      }
    }

    return typeof cause === 'symbol' ? cause.toString() : String(cause)
  }
}
```

**Key features:**

- Accepts `unknown` for `cause` (no casting needed)
- Auto-generates namespace from class name
- Preserves full error chain with intelligent formatting:
  - Errors: Shows full stack trace
  - Objects: Pretty-printed JSON
  - Strings/primitives: Direct display
- Better than native `Error.toString()` which ignores the `cause` entirely

---

## 3. When to Create Custom Error Classes

### The Problem: Error Class Bloat

Creating a new error class for every function creates maintenance hell.

❌ **Bad: One error per function**

```typescript
export class SessionParseError extends BaseError {}
export class InvalidApiKeyError extends BaseError {}
export class ModelsFetchError extends BaseError {}
export class SubscriptionError extends BaseError {}
// ... 20 more nearly identical classes
```

**Problems:**

- 30+ error classes that are just empty wrappers
- No clear signal when something is "special"
- Harder to handle errors (need to import 20 types)
- Message already describes what failed

---

### The Solution: Domain Errors + Special Cases

**Guideline:** Use **5-7 broad domain errors** by default. Only create custom errors when you need **special fields or behavior**.

#### ✅ Core Domain Errors (Always Keep These)

```typescript
// src/errors.ts
export class DbError extends BaseError {}
export class NetworkError extends BaseError {}
export class ValidationError extends BaseError {}
export class ChatError extends BaseError {}
export class SocketError extends BaseError {}
```

**Usage:**

```typescript
// ✅ Good: Descriptive message, reusable error type
if (!session) {
  return err(new DbError('Session parse failed'))
}

const result = await ResultAsync.fromPromise(
  api.validateKey(key),
  (e) => new NetworkError('API key validation failed', e)
)

if (!isValidFormat(modelId)) {
  return err(new ValidationError(`Invalid model format: ${modelId}`))
}
```

---

#### ✅ Special Errors (Only When You Need Custom Fields or Logic)

Create a custom error class **only if:**

1. **It has custom fields** (e.g., `retryAfterMs`, `modelId`)
2. **It requires special handling logic** (e.g., retry logic for rate limits)
3. **Type discrimination is critical** (e.g., `instanceof RateLimitError`)

```typescript
// ✅ Good: Custom field for retry logic
export class RateLimitError extends BaseError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    cause?: unknown
  ) {
    super(message, cause)
  }
}

// ✅ Good: Custom field for debugging
export class InvalidModelFormatError extends BaseError {
  constructor(
    public readonly modelId: string,
    cause?: unknown
  ) {
    super(`Invalid model format: ${modelId}. Expected 'provider:model'`, cause)
  }
}

// ✅ Good: Custom field for error context
export class MessageNotFoundError extends BaseError {
  constructor(
    public readonly messageId: string | number,
    cause?: unknown
  ) {
    super(`Message ${messageId} not found`, cause)
  }
}
```

---

#### ❌ Delete These Redundant Errors

Replace these with domain errors + descriptive messages:

| Delete This               | Replace With                                       |
| ------------------------- | -------------------------------------------------- |
| `SessionParseError`       | `DbError('Session parse failed')`                  |
| `InvalidApiKeyError`      | `ValidationError('Invalid API key')`               |
| `ModelsFetchError`        | `NetworkError('Models fetch failed')`              |
| `SocketConnectionError`   | `SocketError('Connection failed')`                 |
| `VsCodeAuthTimeoutError`  | `NetworkError('VS Code auth timeout')`             |
| `SupabaseSetSessionError` | `NetworkError('Supabase session failed')`          |
| `EnvValidationError`      | `ValidationError('Environment validation failed')` |

**Before (Bloated):**

```typescript
// 3 nearly identical error classes
export class InvalidApiKeyError extends BaseError {}
export class UnsupportedProviderError extends BaseError {}
export class ValidationTimeoutError extends BaseError {}

// Usage:
if (!isValid(key)) return err(new InvalidApiKeyError('Invalid key'))
if (!supported) return err(new UnsupportedProviderError('Bad provider'))
```

**After (Lean):**

```typescript
// 1 error class, descriptive messages
export class ValidationError extends BaseError {}

// Usage:
if (!isValid(key)) return err(new ValidationError('Invalid API key format'))
if (!supported) return err(new ValidationError(`Unsupported provider: ${provider}`))
```

---

### Decision Tree: Should I Create a New Error Class?

```
┌─────────────────────────────────────┐
│ Do I need a custom field or logic?  │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │ YES           │ NO
       │               │
       ▼               ▼
  Create custom    Use domain error
  error class      + descriptive message
       │               │
       │               ▼
       │         DbError('...')
       │         NetworkError('...')
       │         ValidationError('...')
       │         ChatError('...')
       │         SocketError('...')
       │
       ▼
  export class RateLimitError extends BaseError {
    constructor(
      message: string,
      public readonly retryAfterMs?: number,
      cause?: unknown
    ) {
      super(message, cause)
    }
  }
```

---

## 4. Error Mappers: When and How to Use Them

### What Are Error Mappers?

Error mappers convert thrown errors (from `Promise` rejections) into your custom error types.

```typescript
ResultAsync.fromPromise(
  riskyOperation(),
  (unknownError) => new NetworkError('Operation failed', unknownError)
  //              ↑ This is the error mapper
)
```

---

### ✅ When to Use Error Mappers

**Use error mappers to:**

1. **Wrap third-party errors** (fetch, axios, database drivers)
2. **Add context** to generic errors
3. **Preserve the error chain** with the `cause` parameter

```typescript
// ✅ Good: Wrap fetch error with context
const result = await ResultAsync.fromPromise(
  fetch('/api/models'),
  (e) => new NetworkError('Failed to fetch models from API', e)
)

// ✅ Good: Wrap database error with operation context
const dbResult = await ResultAsync.fromPromise(
  db.conversations.get(id),
  (e) => new DbError(`Failed to retrieve conversation ${id}`, e)
)
```

---

### ❌ When NOT to Use Error Mappers

**Don't use error mappers for:**

1. **Validation logic** (use `if` checks and return `err(...)`)
2. **Business logic errors** (these aren't exceptions)
3. **Over-wrapping** (don't wrap `NetworkError` in another `NetworkError`)

```typescript
// ❌ Bad: Using mapper for validation
const result = await ResultAsync.fromPromise(
  Promise.resolve(input),
  (e) => new ValidationError('Invalid input')
)

// ✅ Good: Direct validation
if (!isValid(input)) {
  return err(new ValidationError('Invalid input format'))
}

// ❌ Bad: Over-wrapping (NetworkError wraps NetworkError)
const apiResult = await fetchFromApi() // Returns Result<T, NetworkError>
if (apiResult.isErr()) {
  return err(new NetworkError('API failed', apiResult.error)) // Redundant
}

// ✅ Good: Just propagate the existing error
if (apiResult.isErr()) {
  return err(apiResult.error)
}
```

---

### Error Mapper Patterns

#### Pattern 1: Simple Wrap (Most Common)

```typescript
const result = await ResultAsync.fromPromise(
  asyncOperation(),
  (e) => new NetworkError('Context message', e)
)
```

#### Pattern 2: Type Discrimination

```typescript
const result = await ResultAsync.fromPromise(apiCall(), (e) => {
  if (e instanceof TimeoutError) {
    return new NetworkError('Request timed out', e)
  }
  if (e instanceof AuthError) {
    return new ValidationError('Unauthorized', e)
  }
  return new NetworkError('Unknown error', e)
})
```

#### Pattern 3: Preserve Custom Errors (Pass-Through)

```typescript
// If the error is already a domain error, don't rewrap
const mapError = (e: unknown) => {
  if (e instanceof NetworkError || e instanceof DbError) {
    return e // ✅ Already wrapped
  }
  return new NetworkError('Unexpected error', e)
}

const result = await ResultAsync.fromPromise(operation(), mapError)
```

---

### ⚠️ Anti-Pattern: Error Mapper Factories

Avoid creating "error mapper factory functions" unless you have 5+ identical mappers.

```typescript
// ❌ Overengineered: Only used once
const createNetworkErrorMapper = (context: string) => (e: unknown) => new NetworkError(context, e)

const result = await ResultAsync.fromPromise(
  api.call(),
  createNetworkErrorMapper('API call failed')
)

// ✅ Simple: Inline mapper
const result = await ResultAsync.fromPromise(
  api.call(),
  (e) => new NetworkError('API call failed', e)
)
```

**Exception:** If you have 5+ identical patterns, extract a helper:

```typescript
// ✅ OK: Used in 10 places
function wrapNetworkError(context: string) {
  return (e: unknown) => new NetworkError(context, e)
}
```

---

## 5. Union Types for Error Composition

Use TypeScript union types to declare all possible errors a function can return.

### ✅ Good: Explicit Error Union

```typescript
// Caller knows exactly what can fail
async function sendMessage(
  messageId: number,
  modelId: string
): Promise<Result<void, NetworkError | ValidationError | RateLimitError>> {
  if (!isValidModel(modelId)) {
    return err(new ValidationError(`Invalid model: ${modelId}`))
  }

  const socketResult = await socket.waitForConnection()
  if (socketResult.isErr()) {
    return err(new NetworkError('Socket unavailable', socketResult.error))
  }

  // ... API call that might rate limit
}

// View can handle specific errors
const result = await sendMessage(id, model)
if (result.isErr()) {
  if (result.error instanceof RateLimitError) {
    showAlert('Rate limited. Retry in 60s.')
  } else if (result.error instanceof ValidationError) {
    showAlert('Invalid model selected.')
  } else {
    showAlert('Network error. Check connection.')
  }
}
```

### ❌ Bad: Vague Error Type

```typescript
// Caller has no idea what errors are possible
async function sendMessage(): Promise<Result<void, BaseError>> { ... }

// View can't handle errors specifically
const result = await sendMessage()
if (result.isErr()) {
  showAlert('Something went wrong') // Useless message
}
```

---

## 6. How to Use `neverthrow`

Follow these patterns to ensure code is predictable, type-safe, and easy to debug.

### ✅ Allowed `neverthrow` APIs

| API                         | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `ok(value)` / `err(error)`  | Create a `Result`.                                     |
| `ResultAsync.fromPromise()` | Convert a `Promise` into a `Result`.                   |
| `Result.fromThrowable()`    | Wrap a function that might throw (e.g., `JSON.parse`). |
| `.isOk()` / `.isErr()`      | Check the state of a `Result`.                         |
| `.value` / `.error`         | Access the inner value/error (after checking).         |
| `.match()`                  | Useful for clean branching in views.                   |
| `._unsafeUnwrap()`          | Use sparingly, only when 100% certain of the state.    |

### The Fail-Fast Pattern (The Right Way)

Always use `if (result.isErr())` for clear, sequential control flow.

```typescript
// ✅ DO THIS
async function processData(input: string): Promise<Result<Output, ValidationError | NetworkError>> {
  const validateResult = validate(input)
  if (validateResult.isErr()) {
    return err(validateResult.error) // Early return
  }

  const fetchResult = await fetchData(validateResult.value)
  if (fetchResult.isErr()) {
    return err(fetchResult.error) // Early return
  }

  return ok(transform(fetchResult.value))
}

// ❌ NOT THIS
return validate(input).andThen(fetchData).map(transform)
```

---

## 7. How to Handle Critical vs. Non-Critical Errors

### Critical Errors → Fail the Whole Operation

If the app cannot function without something, propagate the error using `return err(...)`.

```typescript
// Models are critical. The app is useless without them.
const initResult = await initializeModels()
if (initResult.isErr()) {
  return err(initResult.error) // ✅ CRITICAL: Must fail.
}
```

### Non-Critical Errors → Warn and Continue

If the app can still function, log a warning and return `ok(undefined)`.

```typescript
// Cross-tab sync is nice, but not critical. The current tab still works.
const postResult = Result.fromThrowable(() => channel.postMessage({ type: 'reload' }))()

if (postResult.isErr()) {
  logger.warn('Failed to notify other tabs', {
    error: postResult.error.message,
  }) // ⚠️ NON-CRITICAL: Just warn.
}

return ok(undefined) // ✅ Success, because the main task succeeded.
```

---

## 8. Refactoring Guide: From Bloat to Lean

### Step 1: Identify Redundant Errors

Run this check on your `errors.ts`:

```typescript
// If the error class is just this:
export class MySpecialError extends BaseError {}

// And it's only used like this:
return err(new MySpecialError('Some message'))

// → Delete it, use domain error instead
return err(new NetworkError('Some message'))
```

### Step 2: Replace Usage Sites

**Before:**

```typescript
import { ModelsFetchError } from '@/errors'

const result = await ResultAsync.fromPromise(
  api.getModels(),
  (e) => new ModelsFetchError('Fetch failed', e)
)
```

**After:**

```typescript
import { NetworkError } from '@/errors'

const result = await ResultAsync.fromPromise(
  api.getModels(),
  (e) => new NetworkError('Failed to fetch models', e)
)
```

### Step 3: Update Type Annotations

**Before:**

```typescript
type ApiKeyValidationError =
  | InvalidApiKeyError
  | BadRequestError
  | NetworkValidationError
  | ServerValidationError
  | UnsupportedProviderError
```

**After:**

```typescript
type ApiKeyValidationError = NetworkError | ValidationError
```

### Step 4: Delete the Error Classes

Remove the now-unused error classes from `src/errors.ts`.

---

## 9. Final Checklist

Before committing your error handling code, verify:

- [ ] Is the error logged **once** at the boundary (view)?
- [ ] Does the composable **only log if it's fire-and-forget or background**?
- [ ] Does the log entry include **business context + infrastructure cause**?
- [ ] Does my custom error extend `BaseError` with a `cause`?
- [ ] Am I using **domain errors** (DbError, NetworkError, etc.) instead of creating a new class?
- [ ] If I created a custom error, does it have **custom fields or special logic**?
- [ ] Am I using error mappers **only for third-party exceptions**, not validation?
- [ ] Am I using `if (result.isErr())` instead of `.map()` or `.andThen()`?
- [ ] Is my function returning `Promise<Result<T, E>>`?
- [ ] Does my error union type clearly document all failure modes?
- [ ] Am I showing a user-friendly message for critical errors?
- [ ] Is the error message self-documenting (no abbreviations, clear intent)?
- [ ] **Am I using domain errors (NEVER `new Error()`)?**
- [ ] **Am I avoiding `as Error` casts (BaseError accepts `unknown`)?**
