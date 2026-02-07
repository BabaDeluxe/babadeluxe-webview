# Error Handling Guideline

This document guides you on how to handle errors, create custom error types, log effectively, and present user-facing feedback within our application.

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

---

### 3. NEVER Return `ResultAsync` (in function signatures)

Functions must return `Promise<Result<T, E>>`, not `ResultAsync<T, E>`.

❌ **FORBIDDEN:**

```typescript
async function fetchData(): ResultAsync<Data, NetworkError> { ... }
```

✅ **REQUIRED:**

```typescript
async function fetchData(): Promise<Result<Data, NetworkError>> { ... }
```

**Note:** `ResultAsync.fromPromise()` is fine inside the function body; just don’t expose `ResultAsync` as a public return type. [github](https://github.com/supermacro/neverthrow/wiki/Working-with-ResultAsync)

---

### 4. NEVER Use Chaining Methods (in business logic)

Do **not** use these `neverthrow` methods in business logic. They hide control flow and make debugging harder.

❌ **FORBIDDEN:**

- `result.map()`
- `result.mapErr()`
- `result.andThen()`
- `result.orElse()`

✅ **REQUIRED:**

```typescript
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

**Exception:** `result.match(...)` is allowed in **views only** (final branching for UI). [npmjs](https://www.npmjs.com/package/neverthrow/v/4.2.2)

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
async function handleDeleteConversation(id: string) {
  const result = await deleteConversation(id)

  if (result.isErr()) {
    logger.error('Conversation deletion failed', {
      conversationId: id,
      userId: currentUser.value?.id,
      error: result.error,
    })

    // User-facing feedback is governed by Section 11.
    showAlert('Failed to delete conversation')
    return
  }

  logger.info('Conversation deleted', { conversationId: id })
}
```

### ⚠️ Composables Log (Exception Cases Only)

Composables should **NOT** log by default. They return `Result<T, E>` so the caller can decide.

Only log in composables if:

1. **Fire-and-forget operations:** No caller will log (cross-tab sync, background cleanup).
2. **Long-running background tasks:** WebSocket reconnects, polling loops, event listeners.
3. **App-critical initialization:** Database setup, config loading at startup that blocks the entire app.

Rule of thumb: If your composable returns a `Result<T, E>`, the caller will handle it—**don’t log**.

---

## 2. BaseError Implementation

All custom errors **must** extend `BaseError`. Here’s the required implementation (updated to your final version):

```typescript
export class BaseError extends Error {
  public readonly namespace: string
  public readonly originalCause?: unknown

  constructor(
    message: string,
    cause?: unknown,
    public readonly namespaceOverride?: string
  ) {
    const namespace = namespaceOverride ?? new.target.name.replace(/Error$/, '')
    const options = cause instanceof Error ? { cause } : undefined

    super(`[${namespace}] ${message}`, options)

    this.name = new.target.name
    this.namespace = namespace
    this.originalCause = cause

    Object.setPrototypeOf(this, new.target.prototype)
  }

  public override toString(): string {
    let output = this.stack ?? `${this.name}: ${this.message}`

    if (this.originalCause !== undefined) {
      const causeString = this.formatCause(this.originalCause)
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

**Important UX rule:** `BaseError.message` is **not** user-facing (it includes `[Namespace] ...`). Never show it directly to users; map errors to UX strings (Section 11).

---

## 3. When to Create Custom Error Classes

### The problem: Error class bloat

Creating a new error class for every function creates maintenance hell.

❌ Bad: One error per function

```typescript
export class SessionParseError extends BaseError {}
export class InvalidApiKeyError extends BaseError {}
export class ModelsFetchError extends BaseError {}
export class SubscriptionError extends BaseError {}
```

Problems:

- 30+ error classes that are just empty wrappers.
- No clear signal when something is special.
- Harder to handle errors (need to import 20 types).
- Message already describes what failed.

### The solution: Domain errors + special cases

Guideline: Use **5–7 broad domain errors** by default. Only create custom errors when you need **special fields or behavior**.

#### ✅ Core domain errors

```typescript
export class DbError extends BaseError {}
export class NetworkError extends BaseError {}
export class ValidationError extends BaseError {}
export class ChatError extends BaseError {}
export class SocketError extends BaseError {}
export class AuthError extends BaseError {}
export class InitializationError extends BaseError {}
```

#### ✅ Special errors (only when needed)

Create a custom error class only if:

1. It has custom fields (e.g., `retryAfterMs`, `modelId`).
2. It requires special handling logic.
3. Type discrimination is critical (e.g., `instanceof RateLimitError`).

```typescript
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

Error mappers convert thrown errors (from Promise rejections) into your custom error types.

```typescript
const result = await ResultAsync.fromPromise(
  riskyOperation(),
  (unknownError) => new NetworkError('Operation failed', unknownError)
)
```

### ✅ When to use error mappers

Use error mappers to:

1. Wrap third-party errors (fetch, axios, database drivers).
2. Add context when the original error is too generic.
3. Preserve the error chain with the cause/originalCause.

### ⚠️ Preserve library error messages (when informative)

```typescript
const result = await ResultAsync.fromPromise(api.call(), (e) => {
  if (e instanceof Error) {
    return new NetworkError(e.message, e)
  }
  return new NetworkError('API call failed', e)
})
```

### ❌ When NOT to use error mappers

Don’t use error mappers for:

1. Validation logic (use `if` checks and return `err(...)`).
2. Business logic errors (these aren’t exceptions).
3. Over-wrapping (don’t wrap `NetworkError` in another `NetworkError`).

---

## 5. Union Types for Error Composition

Use TypeScript union types to declare all possible errors a function can return.

✅ Good: explicit union

```typescript
async function sendMessage(
  messageId: number,
  modelId: string
): Promise<Result<void, NetworkError | ValidationError | RateLimitError>> {
  // ...
}
```

❌ Bad: vague error type

```typescript
async function sendMessage(): Promise<Result<void, BaseError>> { ... }
```

---

## 6. How to Use `neverthrow`

Allowed `neverthrow` APIs:

- `ok(value)` / `err(error)`
- `ResultAsync.fromPromise()` [github](https://github.com/supermacro/neverthrow/wiki/Working-with-ResultAsync)
- `Result.fromThrowable()`
- `.isOk()` / `.isErr()`
- `.value` / `.error` (after checking)
- `.match()` (views only) [npmjs](https://www.npmjs.com/package/neverthrow/v/4.2.2)
- `._unsafeUnwrap()` (sparingly)

The fail-fast pattern (preferred):

```typescript
const validateResult = validate(input)
if (validateResult.isErr()) return err(validateResult.error)

const fetchResult = await fetchData(validateResult.value)
if (fetchResult.isErr()) return err(fetchResult.error)

return ok(transform(fetchResult.value))
```

---

## 7. Critical vs. Non-Critical Errors

Critical errors → Fail the whole operation (`return err(...)`).

Non-critical errors → Warn and continue (`logger.warn(...)`, then `return ok(...)`).

---

## 8. Logging Best Practices

- Auto-extract caller info: don’t manually log file/function/line.
- Log business context + error object: `logger.error('...', { conversationId, userId, error })`.
- Don’t duplicate infra details already present in `cause/originalCause`.

---

## 9. Framework Error Boundaries (Unexpected Exceptions)

Results are for **expected failures**. Framework handlers catch **unexpected exceptions** (bugs, render crashes, third-party throws).

### 9.1 Global Vue error handler

Set a global handler for uncaught errors in Vue. [book2s](https://www.book2s.com/tutorials/vuejs-app-config-errorhandler.html)

```typescript
// main.ts
app.config.errorHandler = (err, instance, info) => {
  logger.error('Uncaught Vue exception', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    error: err,
  })
}
```

### 9.2 Component boundary with `onErrorCaptured`

Use `onErrorCaptured()` to isolate widget-level crashes and show fallback UI. [book2s](https://www.book2s.com/tutorials/vuejs-onerrorcaptured.html)

```typescript
import { onErrorCaptured, ref } from 'vue'

const hasWidgetError = ref(false)

onErrorCaptured((err, instance, info) => {
  logger.error('Widget crashed', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    error: err,
  })

  hasWidgetError.value = true
  return false // stop propagation to global handler
})
```

### 9.3 Throwing policy

- Business logic and composables: do not throw; return `Result<T, E>`.
- Framework APIs that effectively require throwing: document explicitly per case.

---

## 10. Framework Boundary + Result Rule

If you already have a `Result<T, E>`, don’t convert it into throws just to let Vue catch it.

❌ Bad:

```typescript
if (result.isErr()) throw result.error
```

✅ Good:

```typescript
if (result.isErr()) return err(result.error)
```

---

## 11. User-Facing Messages (Perplexity Style)

Philosophy: **Minimal, professional, actionable**. Avoid toast spam. Avoid “cute” tone.

### 11.1 Never show these to users

- Stack traces, raw error objects.
- `BaseError.message` (it contains `[Namespace] ...`).
- Internal service names or cryptic codes.

### 11.2 What to show vs. only log

Show user-facing feedback only if:

- The user can take action (retry, fix input, sign in), or
- The error blocks the core experience (auth/session, initialization).

Log-only if:

- It’s non-actionable and the UI can proceed.

### 11.3 UI pattern rules

- `ValidationError` → **Inline** next to the field/action.
- `AuthError` / `InitializationError` → **Blocking modal** with a clear next step (“Sign in”, “Reload”).
- `NetworkError` → **Persistent toast** (or inline near the failed action) with “Retry”.
- `RateLimitError` → Inline near the action; disable action; show retry time if available.

### 11.4 Copy rules

- State what happened, then what to do next.
- Keep toasts short; modals can be slightly longer.
- Neutral, calm language.

Examples:

- “Network error. Check connection and retry.”
- “Session expired. Sign in to continue.”
- “Model ID must be in format provider:model.”

---

## 12. Refactoring Guide: From Bloat to Lean

(Keep your existing refactoring steps; they’re good.)

---

## 13. Final Checklist

Before committing:

- [ ] No `new Error()` anywhere.
- [ ] No `as Error` casts.
- [ ] Function signatures return `Promise<Result<T, E>>` (not `ResultAsync`). [github](https://github.com/supermacro/neverthrow/wiki/Working-with-ResultAsync)
- [ ] No chaining methods (`map`, `andThen`, …) in business logic.
- [ ] Views log once with business context; composables are silent unless fire-and-forget/background.
- [ ] Error mappers wrap third-party throws; validation uses explicit checks.
- [ ] Vue `app.config.errorHandler` is configured. [vueframework](https://vueframework.com/api/application-config.html)
- [ ] `onErrorCaptured` is used where we need component-level crash isolation. [vuejs](https://vuejs.org/api/composition-api-lifecycle)
- [ ] User-facing feedback follows approved patterns (inline/toast/modal).
- [ ] Never display `BaseError.message` directly to users.
