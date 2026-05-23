# Document Drift Report

This file documents discrepancies between the codebase implementation and the project's markdown documentation.

## docs/ENVS.md vs src/env-validator.ts

1.  **Required Variables:**
    - `docs/ENVS.md` states that `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SOCKET_URL` are always required.
    - `src/env-validator.ts` makes them optional in the Zod schema and uses a `superRefine` to only require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if `VITE_OFFLINE_MODE` is not enabled.
2.  **Missing Variables:**
    - `docs/ENVS.md` does not mention `VITE_OFFLINE_MODE`, `VITE_GA_MEASUREMENT_ID`, or `VITE_STATSIG_CLIENT_KEY`.
3.  **Boot Validation Example:**
    - The example Zod schema in `docs/ENVS.md` is much simpler and outdated compared to the implementation in `src/env-validator.ts`.
    - The implementation uses `neverthrow` (`Result` type) for returning validation results, which is not mentioned in `docs/ENVS.md`.

## docs/ARCHITECTURE.md vs src/injection-keys.ts

1.  **Injection Keys:**
    - `docs/ARCHITECTURE.md` mentions `APP_DB_KEY` and `LOGGER_KEY`.
    - `src/injection-keys.ts` includes many more: `ENV_CONFIG_KEY`, `SEARCH_SERVICE_KEY`, `KEY_VALUE_STORE_KEY`, `SUPABASE_CLIENT_KEY`, `SOCKET_MANAGER_KEY`, `ANALYTICS_MANAGER_KEY`, `API_KEY_VALIDATOR_KEY`, `AUTH_PROVIDER_KEY`, and `VSCODE_BRIDGE_KEY`.

## docs/AUTH.md vs src/auth/

1.  **Auth Providers:**
    - `docs/AUTH.md` mentions VS Code token bridge and Supabase PKCE OAuth.
    - The codebase (`src/auth/zitadel-auth-provider.ts`) suggests there might be support for Zitadel, which is not mentioned in the docs.

---

## Pass Summary: 2025-05-22

**Branch Analyzed:** `dev`

**Files Reviewed:**
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SYNC_DESIGN.md`
- `docs/ENVS.md`
- `UNFINISHED.md`
- `babadeluxe-docs/docs/ARCHITECTURE.md`
- `babadeluxe-docs/docs/getting-started.md`
- `babadeluxe-docs/docs/CONTRIBUTING.md`
- `CONTRIBUTING.md`

**Regressions Found & Fixed:**
- **Architecture:** `docs/ARCHITECTURE.md` and `babadeluxe-docs/docs/ARCHITECTURE.md` were missing 9+ injection keys and listed stale service paths.
- **Sync Feature:** `docs/SYNC_DESIGN.md` was stuck in "Design" status despite implementation; paths and interfaces were outdated.
- **Environment:** `docs/ENVS.md` boot validation examples didn't match the `neverthrow` + `superRefine` implementation in `src/env-validator.ts`.
- **Debt Tracking:** `UNFINISHED.md` listed completed refactors (AppDb → ChatRepository) as pending.
- **Onboarding:** `getting-started.md` and `README.md` failed to mention the now-implemented GitHub Synchronization feature.

**Files Changed:**
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SYNC_DESIGN.md`
- `docs/ENVS.md`
- `UNFINISHED.md`
- `babadeluxe-docs/docs/ARCHITECTURE.md`
- `babadeluxe-docs/docs/getting-started.md`
- `DOC_DRIFT.md`
- `src/composables/use-settings.ts` (Fixed test-mode logic)
- `tests/settings-view.integration.test.ts` (Fixed mock types)
- `tests/use-settings-socket.test.ts` (Fixed missing DB mocks)

**Test "Non-sense" Fixed:**
- Fixed `useSettings` composable to not hardcode `import.meta.env.MODE === 'test'` as offline mode, which was preventing socket-based integration tests from running their intended logic.
- Expanded `mockDb` in `use-settings-socket.test.ts` to include `add`, `put`, `update`, and `delete` methods, resolving `TypeError` during test execution.
- Updated `SettingsView` and `useSettings` mocks to return proper `neverthrow` `Result` types and reactive refs, resolving "Cannot read properties of undefined (reading 'value')" errors.

---

## Pass Summary: 2026-05-23

**Branch Analyzed:** `dev`

**Files Reviewed:**
- `README.md`
- `docs/ARCHITECTURE.md` (root and submodule)
- `docs/SYNC_DESIGN.md`
- `docs/ENVS.md`
- `UNFINISHED.md`
- `babadeluxe-docs/docs/getting-started.md`

**Regressions Found & Fixed:**
- **Sync Feature:** `docs/SYNC_DESIGN.md` was outdated; updated status to "Implemented (GitHub)", replaced stale `SyncChatEnvelope` with `SyncPayload`, and updated implementation phases.
- **Environment:** `docs/ENVS.md` was missing conditional optionality details for `VITE_OFFLINE_MODE` and had an outdated Zod validation code example.
- **Debt Tracking:** `UNFINISHED.md` still listed Ollama and DeepSeek model discovery as unfinished, but they are implemented in the frontend.
- **Architecture:** `babadeluxe-docs/docs/ARCHITECTURE.md` was missing the "Dependency Injection" section and its 11 injection keys, and the "Persistence" section didn't mention the `ChatRepository` refactor.
- **Onboarding:** `README.md` and `getting-started.md` were updated to include GitHub Synchronization as a major feature.

**Files Changed:**
- `README.md`
- `docs/SYNC_DESIGN.md`
- `docs/ENVS.md`
- `UNFINISHED.md`
- `babadeluxe-docs/docs/ARCHITECTURE.md`
- `babadeluxe-docs/docs/getting-started.md`
- `DOC_DRIFT.md`
