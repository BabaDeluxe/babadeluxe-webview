# Authentication Flows

This document describes every authentication path the webview supports, the code involved in each, and known edge cases.

---

## Environment Detection

Before any auth logic runs, the app detects its runtime environment synchronously at router creation time (`src/routes.ts`):

````ts
const { isInVsCode } = useIsInVsCode()
```text

`useIsInVsCode` calls `getVsCodeApi()` which probes `globalThis.acquireVsCodeApi`. This is injected exclusively by the VS Code webview host — it is `undefined` in every normal browser. The result drives two decisions:

| `isInVsCode` | Router history          | Auth strategy          |
| :----------- | :---------------------- | :--------------------- |
| `true`       | `createMemoryHistory()` | VS Code token bridge   |
| `false`      | `createWebHistory()`    | Supabase OAuth / email |

---

## Route Guard

`router.beforeEach` in `src/routes.ts` runs on every navigation:

1. **Offline mode** — all auth/login routes redirect immediately to `/chat`, no session check.
2. **Authenticated + public route** (`/`, `/login`, `/auth/callback`) — redirects to `/chat` to avoid showing the login screen to a signed-in user.
3. **Unauthenticated + protected route** (`requiresAuth: true`) — redirects to `/` with `?redirect=<original path>` so the destination is restored after login.

---

## Flow 1 — VS Code Token Bridge

**Context:** webview is embedded in the BabaDeluxe VS Code extension.

```text
User opens VS Code extension
        │
        ▼
 useVsCodeAuth composable mounts
        │
        ▼
 postMessage → VS Code host: request session
        │
        ▼
 Host replies with { accessToken, refreshToken }
        │
        ▼
 supabase.auth.setSession({ access_token, refresh_token })
        │
        ▼
 verifySession() → supabase.auth.getSession()
        │
   ┌────┴────┐
session?    no session
   │             │
   ▼             ▼
router →    error state
 /chat
```text

**Key files:**

- `src/composables/use-vs-code-auth.ts` — bridges token from host to Supabase
- `src/vs-code/` — message protocol and `getVsCodeApi()` probe

**Notes:**

- Memory history is used so no real URLs appear in the webview's address bar.
- `acquireVsCodeApi` is only available once per webview lifetime — the probe must run before any async operation.

---

## Flow 2 — Browser OAuth (GitHub / PKCE)

**Context:** user opens `app.babadeluxe.com` or staging in a normal browser.

```text
User clicks "Sign in with GitHub"
        │
        ▼
 Supabase redirects to GitHub
        │
        ▼
 GitHub redirects back to /auth/callback?code=<pkce_code>
        │
        ▼
 AuthCallbackView.vue mounts
        │
        ▼
 supabase.auth.exchangeCodeForSession(code)
        │
        ▼
 verifySession() → supabase.auth.getSession()
        │
   ┌────┴────┐
session?    no session  ← race condition guard (see below)
   │             │
   ▼             ▼
router →    error state + toast
 /chat         "Session could not be verified"
 (or ?redirect)
```text

**Key files:**

- `src/views/AuthCallbackView.vue` — handles the callback, calls `exchangeCodeForSession`
- `src/routes.ts` — `beforeEach` guard that checks session before entering protected routes

---

## Flow 3 — Browser Implicit Flow (hash fragment)

**Context:** Supabase is configured for implicit flow; tokens arrive in the URL hash.

```text
Supabase redirects to /auth/callback#access_token=...&refresh_token=...
        │
        ▼
 AuthCallbackView.vue mounts
        │
        ▼
 Reads hash params: access_token + refresh_token
        │
        ▼
 supabase.auth.setSession({ access_token, refresh_token })
        │
        ▼
 verifySession() → supabase.auth.getSession()
        │
   ┌────┴────┐
session?    no session
   │             │
   ▼             ▼
router →    error state + toast
 /chat
```text

**Notes:**

- Hash params are checked before query params in `AuthCallbackView`.
- `error` / `error_description` hash params are handled first and short-circuit the rest of the flow.

---

## Flow 4 — Email / Password

**Context:** user signs in with email + password on the login screen.

```text
User submits LoginView form
        │
        ▼
 supabase.auth.signInWithPassword({ email, password })
        │
   ┌────┴────┐
success?    error
   │             │
   ▼             ▼
router →    inline form error
 /chat
 (or ?redirect)
```text

**Key files:**

- `src/views/LoginView.vue`

---

## Flow 5 — Password Reset

```text
User requests reset → email sent by Supabase
        │
        ▼
User clicks email link → /auth/callback#type=recovery&access_token=...
        │
        ▼
AuthCallbackView detects type=recovery
        │
        ▼
router → /reset-password
        │
        ▼
User submits new password
        │
        ▼
supabase.auth.updateUser({ password })
        │
        ▼
router → /chat
```text

**Key files:**

- `src/views/ResetPasswordView.vue`

---

## Flow 6 — Offline Mode

When `VITE_OFFLINE_MODE=true` the route guard short-circuits all auth checks and redirects every public route directly to `/chat`. No Supabase calls are made.

---

## The Session Race Condition (Browser)

`supabase.auth.setSession()` and `exchangeCodeForSession()` write to `localStorage` and fire an `onAuthStateChange` event **asynchronously**. There is a narrow window between the call resolving and the session being committed to the internal state cache that `getSession()` reads.

On first page load in Chrome this window is reliably hit, causing `beforeEach` to read `null` and bounce the navigation back to `/login`.

**Fix (PR #57):** `AuthCallbackView` calls `verifySession()` after every auth call. This explicitly confirms `getSession()` returns a non-null session before handing off to the router. If it returns null, the user sees a clear error message instead of a silent white screen.

---

## Callback URL Configuration

The Supabase project's allowed redirect URLs must include:

| Environment | URL                                                |
| :---------- | :------------------------------------------------- |
| Local dev   | `http://localhost:5100/auth/callback`              |
| Staging     | `https://app-staging.babadeluxe.com/auth/callback` |
| Production  | `https://app.babadeluxe.com/auth/callback`         |

Missing entries will cause OAuth providers to reject the redirect with `redirect_uri_mismatch`.
````
