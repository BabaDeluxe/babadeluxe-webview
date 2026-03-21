# Refactoring Tasks Based on Uncle Bob's Critique

## Core Application Logic
- [ ] **src/main.ts**: Extract the async initialization logic from the IIFE into a dedicated `AppInitializer` class.
- [ ] **src/api-key-validator.ts**: Move the `validationTimeoutMs` magic number into a configuration object or a constant at the top of the file.
- [ ] **src/logger.ts**: Disable stack trace parsing for non-error log levels (like `info`, `log`, `debug`) to improve performance.
- [ ] **src/socket-manager.ts**: Replace dynamic getter generation (`_createSocketGetters`) with explicit, statically defined properties for better discoverability and IDE support.
- [ ] **src/retry.ts**: Remove custom retry logic and utilize native Socket.io retry capabilities.
- [ ] **src/App.vue**: Decompose the "God Component" by extracting auth state management, theme watching, and extension message handling into specialized composables.
- [ ] **src/error-mapper.ts**: Replace Zod-based `instanceof` checks with native TypeScript `instanceof` checks.

## Data & Search
- [ ] **src/database/app-db.ts**: Refactor `getMessageCountsByConversation` to use a native IndexedDB count operation instead of loading all messages into memory via `toArray()`.
- [ ] **src/search-service.ts**: Replace the `toArray()` optimization in `_getAllMessages` with a streaming approach or targeted indexing to prevent memory issues with large message counts.

## State Management (Monolith Stores & Composables)
- [ ] **src/stores/use-conversation-store.ts**: Split this "Fat Store" into smaller, focused entities:
    - [ ] `useConversationStore` (State only)
    - [ ] `ChatEngineService` (Socket/Business logic)
    - [ ] `ContextManagerService` (Logic for context calculation and token estimation)
- [ ] **src/stores/use-vs-code-context-store.ts**: Extract VS Code specific message-passing logic into a dedicated `VsCodeBridge` class.
- [ ] **src/composables/use-chat.ts**: Decompose this massive composable into reusable pieces:
    - [ ] `useChatStreaming`
    - [ ] `useChatHistory`
    - [ ] `useChatInput`
- [ ] **src/composables/use-history.ts**: Extract search logic and split-pane state into separate, focused hooks.
- [ ] **src/composables/use-vs-code-auth.ts**: Apply the "Gateway" pattern to better encapsulate host-specific auth logic.

## UI Components & Views
- [ ] **src/components/BaseButton.vue**: Refactor or remove the heavy `useMutationObserver` contrast calculation. Use CSS variables or a predefined design system for accessible colors.
- [ ] **src/components/ChatMarkdownRenderer.vue**: Replace the string-based HTML injection in `markdownFenceEnhancer` with a custom Markdown-it renderer or proper Vue components for code blocks.
- [ ] **src/views/ChatView.vue**: Extract the duplicated "Input Block" (ContextPanel + ChatInput + Controls) into a single reusable component.
- [ ] **src/views/PromptsView.vue**: Consolidate the mobile and desktop layout sections into a single adaptive layout or a shared `PromptLayout` component to eliminate code duplication.

## Testing Suite
- [ ] **tests/setup.ts**: Move global mocks out of the setup file and place them either in dedicated mock files or closer to the individual tests that require them.
- [ ] **General**: Audit remaining unit tests to ensure they use the established high-quality patterns found in `use-date-formatter.test.ts`.
