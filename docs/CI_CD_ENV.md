# CI/CD & Environment Variable Handling

This document describes how environment variables are structured, loaded, and overridden across all deployment stages — local development, staging, and production.

---

## Overview

BabaDeluxe Webview uses **Vite's built-in mode system** to load environment-specific `.env` files at build time. Each deployment stage maps to a distinct Vite mode, ensuring clean separation of config without runtime surprises.

| Stage | Vite Mode | Env File Loaded | `import.meta.env.MODE` |
| :--- | :--- | :--- | :--- |
| Local dev server | `development` | `.env` + `.env.development` | `development` |
| Staging build | `staging` | `.env` + `.env.staging` | `staging` |
| Production build | `production` | `.env` + `.env.production` | `production` |

> `.env` is **always** loaded as the base. Mode-specific files override keys defined there.

---

## Environment Files

```
.env                  # Shared base — committed, localhost defaults
.env.development      # Local dev overrides (if any)
.env.staging          # Staging-specific values — committed
.env.production       # Production-specific values — committed
.env.local            # Machine-local secrets — gitignored, never committed
.env.local.example    # Template for .env.local — committed
```

Only `VITE_*`-prefixed variables are exposed to the browser bundle. All others are Node-only and never reach `import.meta.env`.

---

## Vite Mode vs. NODE_ENV

These are **two separate systems** and must not be conflated:

- `import.meta.env.MODE` — controlled exclusively by the `--mode` flag passed to `vite` / `vite build`. Vite never reads `NODE_ENV` for this value.
- `NODE_ENV` — Vite forcibly sets this to `'production'` during any `vite build` run, regardless of what the CI pipeline passes. Relying on `NODE_ENV` for mode-gating in client code is unreliable.

```ts
// ✅ Reliable — controlled by --mode flag
const isNotProd = import.meta.env.MODE !== 'production'

// ❌ Unreliable — Vite overwrites NODE_ENV to 'production' on every build
const isNotProd = process.env.NODE_ENV !== 'production'
```

---

## CI Pipeline (Woodpecker)

The pipeline is defined in `.woodpecker.yml`. Each step passes `VITE_BUILD_MODE` to the remote deploy script, which forwards it to `pnpm build --mode`.

### deploy-staging

Triggered on push or manual dispatch to the `dev` branch.

```yaml
environment:
  NODE_ENV: staging
  VITE_BUILD_MODE: staging
  REPO_BRANCH: dev
  VITE_APP_URL: https://app-staging.babadeluxe.com
```

Effective build command on the remote server:

```bash
VITE_APP_URL="https://app-staging.babadeluxe.com" pnpm build --mode staging
```

This causes Vite to load `.env` + `.env.staging`, and sets `import.meta.env.MODE` to `'staging'`.

### deploy-prod

Triggered on push or manual dispatch to the `master` branch.

```yaml
environment:
  NODE_ENV: production
  VITE_BUILD_MODE: production
  REPO_BRANCH: master
  VITE_APP_URL: https://app.babadeluxe.com
```

Effective build command on the remote server:

```bash
VITE_APP_URL="https://app.babadeluxe.com" pnpm build --mode production
```

This causes Vite to load `.env` + `.env.production`, and sets `import.meta.env.MODE` to `'production'`.

### Variable Override Priority

For any given key, the resolution order is (highest wins):

1. Inline CI env (`VITE_APP_URL="$VITE_APP_URL" pnpm build …`)
2. Mode-specific file (`.env.staging` / `.env.production`)
3. Shared base (`.env`)

---

## Runtime Environment Validation

All `VITE_*` variables are validated at application boot via Zod in `env-validator.ts`. The app **refuses to start** if any required variable is missing or malformed. This prevents silent configuration drift between environments.

---

## Mode-Gated Code

Use `import.meta.env.MODE` for any client-side branching on environment. The canonical pattern in the codebase is:

```ts
const isNotProd = import.meta.env.MODE !== 'production'
```

This evaluates to `true` in local dev and staging, and `false` in production. Vite replaces `import.meta.env.MODE` with a string literal at build time, so dead-code elimination fully strips non-production branches from the production bundle.

---

## Local Development

1. Copy `.env.local.example` to `.env.local` and fill in your personal secrets.
2. Start the dev server — Vite loads `.env` then `.env.local` (`.env.local` takes priority):

```bash
pnpm dev
```

To test a staging or production build locally:

```bash
pnpm build --mode staging
pnpm build --mode production
```

> `VITE_APP_URL` will default to the committed value in the respective env file. Override inline if needed:
>
> ```bash
> VITE_APP_URL=http://localhost:5100 pnpm build --mode staging
> ```
