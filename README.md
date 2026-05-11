# babadeluxe-webview

<p align="left">
  <img src="https://img.shields.io/badge/license-EUPL%201.2-6a5acd?style=flat-rounded" alt="license">
  <img src="https://img.shields.io/badge/code_style-XO-8a2be2?style=flat-rounded" alt="code style: xo">
  <img src="https://img.shields.io/badge/vue-3-b06ab3?style=flat-rounded" alt="vue 3">
  <img src="https://img.shields.io/badge/node-%3E%3D20-9a56bf?style=flat-rounded" alt="node version">
</p>

> **The chat UI for BabaDeluxe AI Coder.** A Vue 3 webview embedded in the VS Code extension, with full support for real-time streaming, Mermaid diagrams, KaTeX math, and persistent local chat history.

## Getting Started

```bash
pnpm install
pnpm dev
```

- **Node.js**: v20.19.0+ or v22.12.0+
- **Package Manager**: PNPM v9+

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

## Scripts

| Script           | Description                             |
| :--------------- | :-------------------------------------- |
| `dev`            | Start Vite dev server                   |
| `build`          | Type-check and produce production build |
| `test`           | Run unit + E2E test suites              |
| `test-unit`      | Vitest unit tests only                  |
| `test-e2e`       | Playwright E2E tests only               |
| `type-check`     | TypeScript type checking                |
| `format`         | XO + Prettier lint and format           |
| `find-dead-code` | Knip analysis for unused exports        |

## Documentation

| Doc                                     | Covers                                                                     |
| :-------------------------------------- | :------------------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, DI pattern, composables, SafeTable, streaming, search     |
| [AUTH.md](docs/AUTH.md)                 | VS Code bridge auth, Supabase PKCE OAuth, session sync, API key validation |
| [ENVS.md](docs/ENVS.md)                 | All `VITE_*` variables, Zod boot validation, env files per stage           |
| [HTTP.md](docs/HTTP.md)                 | Socket.io layer, `emitWithTimeout`, `retryWithBackoff`, error hierarchy    |
| [CONTRIBUTING.md](CONTRIBUTING.md)      | Dev workflow, commit conventions, PR process                               |

## License

[EUPL 1.2](LICENSE.md)
