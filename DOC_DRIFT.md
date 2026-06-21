# Document Drift Report

This file documents discrepancies between the codebase implementation and the project's markdown documentation.

## Pass Summary: 2026-06-15

**Branch Analyzed:** `dev`

**Files Reviewed:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SYNC_DESIGN.md`
- `docs/AUTH.md`
- `docs/ENVS.md`
- `docs/HTTP.md`
- `CONTRIBUTING.md`
- `package.json`

**Regressions Found & Fixed:**

- **Scripts:** `README.md` was still referencing `XO` for the `format` script, but the project has migrated to `ESLint`.
- **Architecture:** `docs/ARCHITECTURE.md` contained a link to a non-existent `TESTING_GUIDELINE.md` file.

**Files Changed:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `DOC_DRIFT.md`

---

## Pass Summary: 2026-06-14

**Branch Analyzed:** `dev`

**Files Reviewed:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SYNC_DESIGN.md`
- `UNFINISHED.md`
- `src/composables/use-prompts-socket.ts`
- `src/vs-code/types.ts`
- `src/sync/sync-queue.ts`

**Regressions Found & Fixed:**

- **Debt Tracking:** `UNFINISHED.md` contained a stale reference to a TODO in `src/composables/use-prompts-socket.ts` that had already been addressed.
- **Sync Design:** `docs/SYNC_DESIGN.md` incorrectly stated that `SftpSyncRequest` and `SftpSyncResponse` were already defined in `src/vs-code/types.ts`; updated them to "Planned".
- **File Structure:** `docs/SYNC_DESIGN.md` was updated to reflect that `src/sync/sync-queue.ts` is currently a placeholder.
- **Project Structure:** `README.md` and `docs/ARCHITECTURE.md` had stale directory references (`src/validators/`) and incorrect service paths for `ApiKeyValidator` and search logic.
- **Badges:** `README.md` was still displaying an XO badge despite the project migrating to ESLint.

**Files Changed:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SYNC_DESIGN.md`
- `UNFINISHED.md`
- `DOC_DRIFT.md`

## Pass Summary: 2025-05-24

**Branch Analyzed:** `dev`

**Files Reviewed:**

- `README.md`
- `docs/AUTH.md`
- `docs/ENVS.md`
- `babadeluxe-docs/docs/ARCHITECTURE.md`
- `src/auth/supabase-auth-provider.ts`
- `src/views/LoginView.vue`

**Regressions Found & Fixed:**

- **Authentication:** `docs/AUTH.md` and `README.md` were missing Google OAuth support, despite it being implemented and used in `LoginView.vue`.
- **Environment:** `docs/ENVS.md` was missing `VITE_APP_URL`, which is used for canonical OAuth redirects in `SupabaseAuthProvider.ts`.
- **Architecture (Submodule):** `babadeluxe-docs/docs/ARCHITECTURE.md` was significantly out of sync with the root architecture doc, missing the entire Dependency Injection section and the `ChatRepository` refactor details.

**Files Changed:**

- `README.md`
- `docs/AUTH.md`
- `docs/ENVS.md`
- `babadeluxe-docs/docs/ARCHITECTURE.md`
- `DOC_DRIFT.md`

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

---

## Pass Summary: 2026-05-31

**Branch Analyzed:** `dev`

**Files Reviewed:**

- `docs/ARCHITECTURE.md`
- `docs/ENVS.md`
- `docs/SYNC_DESIGN.md`
- `babadeluxe-docs/docs/ARCHITECTURE.md`
- `src/injection-keys.ts`
- `src/env-validator.ts`
- `src/sync/sync-manager.ts`
- `src/sync/sync-queue.ts`
- `src/database/key-value-store.ts`

**Regressions Found & Fixed:**

- **Architecture:** `docs/ARCHITECTURE.md` was missing `GIT_MESSAGE_KEY` and listed a non-existent `src/validators/` directory.
- **Environment:** `docs/ENVS.md` failed to mention that `VITE_APP_URL` is currently bypassed by centralized Zod validation.
- **Sync Design:** `docs/SYNC_DESIGN.md` had stale information about `SyncQueue` being a persistent IndexedDB queue; it is currently an in-memory map.

**Files Changed:**

- `docs/ARCHITECTURE.md`
- `docs/ENVS.md`
- `docs/SYNC_DESIGN.md`
- `DOC_DRIFT.md`

---

## Pass Summary: 2026-06-07

**Branch Analyzed:** `dev`

**Files Reviewed:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SYNC_DESIGN.md`
- `docs/ENVS.md`

**Regressions Found & Fixed:**

- **AI Reasoning:** `docs/ARCHITECTURE.md` was missing documentation for the `chat:reasoningChunk` event and the `reasoning` field in the `AppDb` schema (v8).
- **At-Mentions:** The new `@` mention picker and atomic `AtPill.vue` rendering were undocumented in the core architecture.
- **Subscriptions:** Reactive tier/status management via `use-subscription-socket.ts` was missing from the service documentation.
- **Composer Features:** `README.md` was updated to highlight the new rich composer and reasoning support as user-facing features.

**Files Changed:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `DOC_DRIFT.md`
