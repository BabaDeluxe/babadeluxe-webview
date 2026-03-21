# Refactoring Tasks Based on Uncle Bob's Critique

## Core Application Logic
- [ ] **src/api-key-validator.ts**: Move the `validationTimeoutMs` to the socket timeout in the shared constants
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
- [ ] **src/views/ChatView.vue**: Extract the duplicated "Input Block" (ContextPanel + ChatInput + Controls) into a single reusable component.
- [ ] **src/views/PromptsView.vue**: Consolidate the mobile and desktop layout sections into a single adaptive layout or a shared `PromptLayout` component to eliminate code duplication.

## Testing Suite
- [ ] **General**: Audit remaining unit tests to ensure they use the established high-quality patterns found in `use-date-formatter.test.ts`.
