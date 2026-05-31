# CI/CD & Environment Variable Handling

This document describes how environment variables are structured, loaded, and overridden across all deployment stages — local development, staging, and production. It also covers the full deployment prerequisites: what must exist on the server, which secrets must be registered in Woodpecker, and where each value comes from.

---

## Overview

BabaDeluxe Webview uses **Vite's built-in mode system** to load environment-specific `.env` files at build time. Each deployment stage maps to a distinct Vite mode, ensuring clean separation of config without runtime surprises.

| Stage            | Vite Mode     | Env File Loaded             | `import.meta.env.MODE` |
| :--------------- | :------------ | :-------------------------- | :--------------------- |
| Local dev server | `development` | `.env` + `.env.development` | `development`          |
| Staging build    | `staging`     | `.env` + `.env.staging`     | `staging`              |
| Production build | `production`  | `.env` + `.env.production`  | `production`           |

> `.env` is **always** loaded as the base. Mode-specific files override keys defined there.

---

## Environment Files

````text
.env                  # Shared base — committed, localhost defaults
.env.development      # Local dev overrides (if any)
.env.staging          # Staging-specific values — committed
.env.production       # Production-specific values — committed
.env.local            # Machine-local secrets — gitignored, never committed
.env.local.example    # Template for .env.local — committed
```text

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
```text

---

## Deployment Prerequisites

Before the pipeline can run successfully, the following must be in place.

### 1. Woodpecker CI Secrets

Register these in the Woodpecker repository settings under **Secrets**. They are injected at runtime and are never stored in the repository.

| Secret name       | What it is                                                               | Where to get it                                                                                     |
| :---------------- | :----------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `ssh_user`        | SSH username on the deploy server                                        | Server admin / hosting provider                                                                     |
| `deploy_ssh_key`  | Private SSH key (ed25519 PEM) used to authenticate against the server    | Generate with `ssh-keygen -t ed25519`; add the public key to `~/.ssh/authorized_keys` on the server |
| `deploy_base_dir` | Absolute base path on the server (e.g. `/var/www/vhosts/babadeluxe.com`) | Server admin                                                                                        |

> `SSH_HOST` (`217.160.14.123`) is hardcoded in `.woodpecker.yml` — update it there directly if the server IP changes.

### 2. Server Requirements

The deploy script runs **on the remote server via SSH**. The following must be present before the first deploy:

| Requirement                                | Notes                                                              |
| :----------------------------------------- | :----------------------------------------------------------------- |
| Node.js v20.19.0+ or v22.12.0+ via **nvm** | Must be loadable via `source ~/.nvm/nvm.sh` from `~/.bash_profile` |
| pnpm v9.15.0 via **corepack**              | Activated by `corepack enable && corepack use pnpm@9.15.0`         |
| **GitHub CLI** (`gh`)                      | Used for the initial `gh repo clone` on first deploy               |
| **rsync**                                  | Used to sync `dist/` into the docroot                              |
| **nginx / Apache**                         | Must serve both docroots as static SPA (see config below)          |

### 3. GitHub CLI Authentication on the Server

The first deploy uses `gh repo clone`. Authenticate once on the server:

```bash
gh auth login
# Choose: GitHub.com → HTTPS → Login with a web browser (or paste token)
```text

For non-interactive / headless environments, add to `~/.bash_profile`:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```text

### 4. Server Directory Structure

The pipeline creates all subdirectories via `mkdir -p` automatically. Only `$DEPLOY_BASE_DIR` itself must exist and be writable by `$SSH_USER`:

| Path                                          | Purpose                                         |
| :-------------------------------------------- | :---------------------------------------------- |
| `$DEPLOY_BASE_DIR/babadeluxe-webview-staging` | Git working directory for staging builds        |
| `$DEPLOY_BASE_DIR/babadeluxe-webview-prod`    | Git working directory for production builds     |
| `$DEPLOY_BASE_DIR/app-staging.babadeluxe.com` | Docroot served by the web server for staging    |
| `$DEPLOY_BASE_DIR/app.babadeluxe.com`         | Docroot served by the web server for production |

### 5. Web Server SPA Fallback

Because the app uses client-side routing, the web server must return `index.html` for all unknown paths. Example nginx config (repeat for staging docroot):

```nginx
server {
    listen 443 ssl;
    server_name app.babadeluxe.com;
    root /var/www/vhosts/babadeluxe.com/app.babadeluxe.com;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```text

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
```text

Effective build command on the remote server:

```bash
VITE_APP_URL="https://app-staging.babadeluxe.com" pnpm build --mode staging
```text

This causes Vite to load `.env` + `.env.staging`, and sets `import.meta.env.MODE` to `'staging'`.

### deploy-prod

Triggered on push or manual dispatch to the `master` branch.

```yaml
environment:
  NODE_ENV: production
  VITE_BUILD_MODE: production
  REPO_BRANCH: master
  VITE_APP_URL: https://app.babadeluxe.com
```text

Effective build command on the remote server:

```bash
VITE_APP_URL="https://app.babadeluxe.com" pnpm build --mode production
```text

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
```text

This evaluates to `true` in local dev and staging, and `false` in production. Vite replaces `import.meta.env.MODE` with a string literal at build time, so dead-code elimination fully strips non-production branches from the production bundle.

---

## Local Development

1. Copy `.env.local.example` to `.env.local` and fill in your personal secrets.
2. Start the dev server — Vite loads `.env` then `.env.local` (`.env.local` takes priority):

```bash
pnpm dev
```text

To test a staging or production build locally:

```bash
pnpm build --mode staging
pnpm build --mode production
```text

> `VITE_APP_URL` will default to the committed value in the respective env file. Override inline if needed:
>
> ```bash
> VITE_APP_URL=http://localhost:5100 pnpm build --mode staging
> ```text
````
