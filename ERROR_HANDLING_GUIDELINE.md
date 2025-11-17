# Error Handling Guideline

This document guides you on how to handle errors, create custom error types, and log effectively within our existing application.

## 1. Where to Log: The Golden Rule

This is the most important rule. Where you log depends on the _type_ of error.

### ✅ **Composables log Infrastructure Failures**

Log low-level errors inside the composable, because the view can't fix them. The view only needs to know _that_ it failed so it can show a message.

```typescript
// ✅ In a composable (e.g., use-models-socket.ts)
export async function initializeModels(): Promise<Result<void, ModelsFetchError>> {
  const waitResult = await socket.waitForConnection()

  if (waitResult.isErr()) {
    // This is an infrastructure error. The view can't fix a broken socket.
    logger.error('Failed to connect to socket:', waitResult.error) // ✅ Log it here.
    return err(new ModelsFetchError('Connection failed', waitResult.error))
  }
  // ...
}
```

**Log in composables if it's a:**

- Socket connection failure
- Network timeout
- Server unavailability
- File parsing error

### ✅ **Views log Business Logic Failures**

Log in the view when the error relates to a user action, because the view has the full context.

```typescript
// ✅ In a view component (e.g., SettingsView.vue)
async function handleSaveApiKey() {
  const result = await reloadModels()

  if (result.isErr()) {
    // This is a business logic failure. We have the user context.
    logger.error('Failed to reload models after API key validation:', result.error) // ✅ Log it here.
    modelsReloadWarning.value = 'Models could not be updated. Please reload the page.'
  }
}
```

**Log in views if it's related to:**

- A user clicking a button ("after API key save")
- Form validation failures
- Business rule violations

---

## 2. How to Create Custom Errors

All custom errors **must** extend the `BaseError` class to get automatic namespacing and error chaining.

### Step 1: Define Your `BaseError`

This class should already exist. If not, create it.

```typescript
// src/errors/base-error.ts
export class BaseError extends Error {
  public readonly namespace: string

  constructor(
    message: string,
    public readonly cause?: Error,
    private readonly _namespaceOverride?: string
  ) {
    const namespace = _namespaceOverride || new.target.name.replace(/Error$/, '')
    super(`[${namespace}] ${message}`)
    this.name = new.target.name
    this.namespace = namespace
    Object.setPrototypeOf(this, new.target.prototype) // For ES5 compatibility
  }
}
```

### Step 2: Create a New Error (Zero Boilerplate)

Simply extend `BaseError`. The namespace is derived from the class name automatically.

```typescript
// src/errors/domain-errors.ts
import { BaseError } from './base-error'

export class ModelsFetchError extends BaseError {}
export class ValidationError extends BaseError {}
```

### Step 3: Throw Your New Error

```typescript
// Throw it with a message and optional cause
const result = await ResultAsync.fromPromise(
  api.getStuff(),
  (error) => new ModelsFetchError('API call failed', error as Error)
)
```

**Resulting Error Message:** `[ModelsFetch] API call failed`

---

## 3. How to Use `neverthrow`

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

### ❌ Forbidden `neverthrow` APIs

Do **not** use chaining methods. They hide control flow and make debugging harder.

- **NO** `result.map()`
- **NO** `result.mapErr()`
- **NO** `result.andThen()`
- **NO** `result.orElse()`

Also, functions must **never** return the `ResultAsync` type. Always return a `Promise<Result<...>>`.

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

## 4. How to Handle Critical vs. Non-Critical Errors

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
  logger.warn('Failed to notify other tabs:', postResult.error) // ⚠️ NON-CRITICAL: Just warn.
}

return ok(undefined) // ✅ Success, because the main task succeeded.
```

---

## 5. Quick Reference & Examples

### Putting It All Together

Here is a full, practical example applying all the rules.

```typescript
// 1. A composable handles a critical, failable operation.
// It logs its own infrastructure errors.
export async function fetchModels(): Promise<Result<Model[], ModelsFetchError>> {
  const result = await ResultAsync.fromPromise(
    api.getModels(),
    (error) => new ModelsFetchError('Failed to fetch', error as Error)
  )

  if (result.isErr()) {
    logger.error('Models fetch infrastructure failed:', result.error)
    return err(result.error)
  }

  return ok(result.value)
}

// 2. A view uses the composable and handles the result.
// It logs the business context and gives user feedback.
async function handleSaveAndReload() {
  // ... save something first ...

  const result = await fetchModels()

  if (result.isErr()) {
    logger.error('Failed to reload models after saving settings:', result.error) // Business context log
    errorBanner.value =
      'Your settings were saved, but we failed to refresh the models. Please reload.' // User feedback
    return // Stop the operation
  }

  // Happy path
  logger.log('Models reloaded successfully.')
  // ... update UI with result.value ...
}
```

### Final Checklist

- [ ] Is the error logged in the right place (Composable vs. View)?
- [ ] Does my new error extend `BaseError`?
- [ ] Am I using `if (result.isErr())` instead of `.map()` or `.andThen()`?
- [ ] Is my function returning `Promise<Result<...>>`?
- [ ] Am I showing a user-friendly message for critical errors?
