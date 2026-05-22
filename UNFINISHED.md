# Unfinished Work and Technical Debt

This document tracks identified TODOs, FIXMEs, and incomplete implementations within the BabaDeluxe codebase.

## High Priority / Functional

### Authentication

- **ZitadelAuthProvider**: The `signInWithOAuth`, `signInWithPasskey`, and `signInWithSSO` methods are currently stubs that return errors. The full Zitadel session flow needs to be implemented. (`src/auth/zitadel-auth-provider.ts`)
- **OAuth Callback handling**: While basic OAuth is implemented, some edge cases in session synchronization during redirect might still need attention (ref: `AuthCallbackView.vue`).
- **SupabaseAuthProvider**: `signInWithPasskey` and `signInWithSSO` are explicitly disabled as they require Zitadel configuration which is currently missing/incomplete. (`src/auth/supabase-auth-provider.ts`)

### Model Integration

- **Ollama & DeepSeek**: Support for Ollama and DeepSeek models is implemented in the frontend (`src/composables/use-models-socket.ts`) including discovery logic, though full end-to-end functionality depends on backend availability. (`src/composables/use-models-socket.ts`)

## Technical Debt / Refactoring


### Type Safety

- **Prompt Socket Types**: There is a weird cast in `use-prompts-socket.ts` that suggests shared types between the frontend and backend might be misaligned or incomplete. (`src/composables/use-prompts-socket.ts`)

## UI/UX Improvements

### Error Boundaries

- **ViewErrorBoundary**: Currently wraps roots in a `div` to support transitions, but could be improved to handle specific error types more gracefully or provide better recovery options for end-users.

### Prompt Library

- **Validation**: Current prompt validation is basic (mostly length and presence). Could be improved with regex for command names or template syntax highlighting.

## Scan Results (Raw TODOs)

- `src/composables/use-prompts-socket.ts`: `// TODO Check if the shared types are correct, because this cast is weird`
- `src/composables/use-models-socket.ts`: `ollama: [], // TODO Implement ollama and deepseek`
- `src/auth/zitadel-auth-provider.ts`: `* TODO: implement full Zitadel session flow`
