# babadeluxe-webview

<p align="left">
  <img src="https://img.shields.io/badge/license-EUPL%201.2-6a5acd?style=flat-rounded" alt="license">
  <img src="https://img.shields.io/badge/code_style-ESLint-4B32C3?style=flat-rounded" alt="code style: eslint">
  <img src="https://img.shields.io/badge/vue-3-b06ab3?style=flat-rounded" alt="vue 3">
  <img src="https://img.shields.io/badge/node-%3E%3D20.19%20%3C24-9a56bf?style=flat-rounded" alt="node version">
</p>

> **The chat UI for BabaDeluxe AI Coder.** A Vue 3 webview embedded in the VS Code extension, with full support for real-time streaming, Mermaid diagrams, KaTeX math, and persistent local chat history, and GitHub synchronization.

## Overview

This repo contains the frontend that runs inside the VS Code webview panel. It communicates bidirectionally with the extension host via a typed message bridge, connects to the backend over Socket.io, and stores all chat history locally in IndexedDB via Dexie.

## Architecture & Tech Stack

- **Core:** Vue 3 (Composition API) + TypeScript
- **State:** Pinia
- **Build:** Vite
- **Styling:** UnoCSS (Tailwind conventions)
- **Persistence:** Dexie.js (IndexedDB) with AI Reasoning support
- **Rich Composer:** Fuzzy-matching @mentions
- **Synchronization:** GitHub (REST)
- **Real-time:** Socket.io-client
- **Validation:** Zod + neverthrow
- **Testing:** Vitest (unit) + Playwright (E2E)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#13111a', 'primaryColor': '#2a1758', 'primaryTextColor': '#e2d9f3', 'primaryBorderColor': '#7c3aed', 'lineColor': '#7c3aed', 'secondaryColor': '#1a0f3a', 'tertiaryColor': '#0f1a2a', 'edgeLabelBackground': '#1a1030', 'clusterBkg': '#1a1030', 'clusterBorder': '#4c1d95', 'titleColor': '#e2d9f3', 'nodeBorder': '#7c3aed', 'mainBkg': '#2a1758', 'fontFamily': 'monospace'}}}%%
graph TD
    classDef client fill:#2a1758,stroke:#7c3aed,stroke-width:2px,color:#e2d9f3
    classDef backend fill:#1a0f3a,stroke:#4c1d95,stroke-width:2px,color:#c4b5fd
    classDef storage fill:#1a1a0a,stroke:#d97706,stroke-width:2px,color:#fcd34d
    classDef ext fill:#0f1a2a,stroke:#0891b2,stroke-width:2px,color:#67e8f9

    subgraph ClientLayer ["Client Layer — Browser / VS Code Webview"]
        direction TB
        VueApp[Vue 3 Application]:::client
        DexieDB[(IndexedDB / Dexie)]:::storage
        VSCodeBridge[VS Code Host Bridge]:::client
    end

    subgraph ServiceLayer ["Service Layer"]
        SocketServer[Socket.io Gateway]:::backend
        Supabase[Supabase Auth]:::backend
    end

    External[LLM Providers API]:::ext

    VueApp -->|Read/Write State| DexieDB
    VueApp -->|Bi-directional Sync| SocketServer
    VueApp -->|Auth Tokens| Supabase
    VueApp <-->|Context & File Access| VSCodeBridge

    SocketServer <-->|Streaming Response| External
```

## Key Architecture Concepts

### VS Code Message Bridge

A typed message bridge handles all communication between the Vue app and the extension host. File contents are resolved asynchronously via request/response pairs keyed by a unique `requestId`:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#13111a', 'primaryColor': '#2a1758', 'primaryTextColor': '#e2d9f3', 'primaryBorderColor': '#7c3aed', 'lineColor': '#7c3aed', 'secondaryColor': '#1a0f3a', 'tertiaryColor': '#0f1a2a', 'edgeLabelBackground': '#1a1030', 'actorBkg': '#2a1758', 'actorBorder': '#7c3aed', 'actorTextColor': '#e2d9f3', 'actorLineColor': '#7c3aed', 'signalColor': '#c4b5fd', 'signalTextColor': '#e2d9f3', 'labelBoxBkgColor': '#1a0f3a', 'labelBoxBorderColor': '#4c1d95', 'labelTextColor': '#c4b5fd', 'loopTextColor': '#e2d9f3', 'noteBkgColor': '#1a0f3a', 'noteTextColor': '#c4b5fd', 'noteBorderColor': '#4c1d95', 'activationBkgColor': '#4c1d95', 'activationBorderColor': '#7c3aed', 'sequenceNumberColor': '#e2d9f3', 'fontFamily': 'monospace'}}}%%
sequenceDiagram
    participant Store as Pinia Store
    participant Resolver as Context Resolver
    participant Host as VS Code Host

    Store->>Resolver: resolveContextItems(references)
    Resolver->>Resolver: Generate unique requestId
    Resolver->>Host: postMessage({ type: 'fileContext:resolve', requestId })

    Note over Resolver: Promise Pending...

    Host->>Host: Read Files from Disk
    Host-->>Resolver: postMessage({ type: 'fileContext:response', requestId, content })

    Resolver->>Resolver: Match requestId & Resolve Promise
    Resolver-->>Store: Return Resolved Content
```

### State & Data Layer

Pinia stores are the single source of truth for all domain state. The Dexie layer adds custom `SafeCollection`/`SafeTable` wrappers for type-safe IndexedDB access and a `KeyValueDb` store with automatic `updatedAt` tracking.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#13111a', 'primaryColor': '#2a1758', 'primaryTextColor': '#e2d9f3', 'primaryBorderColor': '#7c3aed', 'lineColor': '#7c3aed', 'edgeLabelBackground': '#1a1030', 'clusterBkg': '#1a1030', 'clusterBorder': '#4c1d95', 'titleColor': '#e2d9f3', 'fontFamily': 'monospace'}}}%%
flowchart LR
    classDef view fill:#2a1758,stroke:#7c3aed,stroke-width:2px,color:#e2d9f3
    classDef logic fill:#1a0f3a,stroke:#4c1d95,stroke-width:2px,color:#c4b5fd
    classDef state fill:#0f2a1a,stroke:#059669,stroke-width:2px,color:#6ee7b7
    classDef infra fill:#1a1a0a,stroke:#d97706,stroke-width:2px,color:#fcd34d

    View[Vue Component]:::view
    Composable[Composable Logic]:::logic
    Store[Pinia Store]:::state
    Service[Socket / DB Service]:::infra

    View -->|User Action| Composable
    Composable -->|Dispatch Action| Store
    Store -->|Async Operation| Service
    Service -->|Result / Stream| Store
    Store -->|Reactive State Update| Composable
    Composable -->|Ref / Computed| View
```

### Error Handling

`neverthrow` replaces thrown exceptions with typed `Result` objects throughout the codebase. Custom error classes (`DbError`, `NetworkError`, `RateLimitError`) give each layer its own failure vocabulary. Critical network calls use `retryWithBackoff` with exponential backoff and jitter.

### Authentication

Two strategies depending on where the webview runs:

- **Embedded in VS Code** — auth tokens are bridged from the extension host via `useVsCodeAuth`, no re-login needed
- **Standalone browser** — standard Supabase PKCE OAuth flow (GitHub / Google / Email)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#13111a', 'primaryColor': '#2a1758', 'primaryTextColor': '#e2d9f3', 'primaryBorderColor': '#7c3aed', 'lineColor': '#7c3aed', 'secondaryColor': '#1a0f3a', 'tertiaryColor': '#0f1a2a', 'edgeLabelBackground': '#1a1030', 'actorBkg': '#2a1758', 'actorBorder': '#7c3aed', 'actorTextColor': '#e2d9f3', 'actorLineColor': '#7c3aed', 'signalColor': '#c4b5fd', 'signalTextColor': '#e2d9f3', 'labelBoxBkgColor': '#1a0f3a', 'labelBoxBorderColor': '#4c1d95', 'labelTextColor': '#c4b5fd', 'loopTextColor': '#e2d9f3', 'noteBkgColor': '#1a0f3a', 'noteTextColor': '#c4b5fd', 'noteBorderColor': '#4c1d95', 'activationBkgColor': '#4c1d95', 'activationBorderColor': '#7c3aed', 'sequenceNumberColor': '#e2d9f3', 'fontFamily': 'monospace'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Webview as Vue Webview
    participant Bridge as VS Code Bridge
    participant Supabase as Supabase Auth
    participant Socket as Socket Server

    rect rgb(26, 15, 58)
        note right of User: Scenario 1 — Embedded in VS Code
        User->>Webview: Opens Extension
        Webview->>Bridge: Request Session (postMessage)
        Bridge-->>Webview: Return GitHub Session
        Webview->>Supabase: Set Session (Refresh Token)
        Supabase-->>Webview: Valid Session & Access Token
        Webview->>Webview: verifySession() — confirm getSession() != null
    end

    rect rgb(15, 26, 42)
        note right of User: Scenario 2 — Standalone Browser
        User->>Webview: Clicks Login
        Webview->>Supabase: OAuth Flow (PKCE)
        Supabase-->>Webview: Redirect to /auth/callback
        Webview->>Supabase: exchangeCodeForSession / setSession
        Webview->>Webview: verifySession() — confirm getSession() != null
        Supabase-->>Webview: Session & Access Token
    end

    Webview->>Socket: Connect (auth: Access Token)
    Socket-->>Webview: Connection Established
```

### Streaming & Rendering

Socket.io token events are committed to the store on a throttled interval (`streamingCommitIntervalMs`) to avoid blocking the main thread during fast generation. The `ChatMarkdownRenderer` handles partial streams including Mermaid diagrams, KaTeX, and syntax-highlighted code via DOMPurify sanitization.

### Search

Client-side conversation search uses Damerau-Levenshtein distance for fuzzy matching, running entirely in the browser against the local IndexedDB.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'background': '#13111a', 'primaryColor': '#2a1758', 'primaryTextColor': '#e2d9f3', 'primaryBorderColor': '#7c3aed', 'lineColor': '#7c3aed', 'edgeLabelBackground': '#1a1030', 'clusterBkg': '#1a1030', 'clusterBorder': '#4c1d95', 'titleColor': '#e2d9f3', 'fontFamily': 'monospace'}}}%%
graph TD
    classDef input fill:#2a1758,stroke:#7c3aed,stroke-width:2px,color:#e2d9f3
    classDef process fill:#1a0f3a,stroke:#4c1d95,stroke-width:2px,color:#c4b5fd
    classDef store fill:#1a1a0a,stroke:#d97706,stroke-width:2px,color:#fcd34d

    UserInput[User Query]:::input --> SearchService
    SearchService[Search Service]:::process -->|Fetch All| DB[(IndexedDB)]:::store
    DB -->|Conversations & Messages| SearchService
    SearchService -->|Tokenize & Normalize| FuzzyLogic[Fuzzy Matching Logic]:::process
    FuzzyLogic -->|Damerau-Levenshtein Score| Results[Ranked Results]:::input
```

## Project Structure

| Directory          | Purpose                                                   |
| :----------------- | :-------------------------------------------------------- |
| `src/composables/` | Reusable Composition API logic                            |
| `src/stores/`      | Pinia stores for conversations, context, and UI state     |
| `src/database/`    | Dexie.js layer with `SafeTable` and `KeyValueDb` wrappers |
| `src/vs-code/`     | Message bridge, type guards, and VS Code protocols        |
| `src/components/`  | `Base*` design system components and feature widgets      |
| `src/views/`       | Route-level pages: Chat, History, Prompts, Settings       |

## Prerequisites

- **Node.js**: v20.19.0+ or v22.12.0+ (specifically `<24`)
- **Package Manager**: PNPM v9+

## Getting Started

```bash
pnpm install
pnpm dev
```

For performance profiling:

```bash
pnpm dev-performance
```

### Environment

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a full breakdown of env files, Vite modes, and deployment stages.

## Scripts

| Script           | Description                             |
| :--------------- | :-------------------------------------- |
| `dev`            | Start Vite dev server                   |
| `build`          | Type-check and produce production build |
| `test`           | Run unit + E2E test suites              |
| `test-unit`      | Vitest unit tests only                  |
| `test-e2e`       | Playwright E2E tests only               |
| `type-check`     | TypeScript type checking                |
| `format`         | ESLint + Prettier lint and format       |
| `find-dead-code` | Knip analysis for unused exports        |

## License

[EUPL 1.2](LICENSE.md)
