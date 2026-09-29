# Documentation Drift Report

- **Date/Time:** 2025-03-11 11:30 UTC
- **Branch Analyzed:** `dev`
- **Files Reviewed:**
  - `README.md`
  - `CONTRIBUTING.md`
  - `docs/ARCHITECTURE.md`
  - `docs/AUTH.md`
  - `docs/AUTH_FLOWS.md`
  - `docs/CI_CD_ENV.md`
  - `docs/ENVS.md`
  - `docs/HTTP.md`
  - `docs/SYNC_DESIGN.md`

## Regressions Found

1. **`docs/ARCHITECTURE.md` (`AsyncInjectable<T>` type definition drift):**
   - The type definition for `AsyncInjectable<T>` in the DI section used `Readonly<Ref<...>>` wrappers, whereas `src/injection-keys.ts` uses plain unwrapped reactive properties (`isReady: boolean`, `hasError: boolean`, `value: T | undefined`).

2. **`docs/HTTP.md` (Error hierarchy base class mismatch):**
   - The error hierarchy diagram listed `AppError (base)` as the root error class. In `src/errors.ts`, custom domain error classes inherit from `BaseError` (imported from `@babadeluxe/shared`); `AppError` is not defined in the codebase.

3. **`docs/SYNC_DESIGN.md` (Uncreated sync adapter file paths):**
   - Section 9 (File Structure) listed `webdav-adapter.ts` and `sftp-adapter.ts` under `src/sync/` as though they were existing files, whereas they are in-progress / planned features and not yet created on disk.

4. **`README.md` (Missing `lint` script in scripts reference):**
   - The Scripts table omitted the `pnpm lint` command and described `pnpm format` as both checking and formatting, whereas `pnpm lint` checks code/formatting and `pnpm format` applies automated fixes.

## Files Changed

- `docs/ARCHITECTURE.md`
- `docs/HTTP.md`
- `docs/SYNC_DESIGN.md`
- `README.md`
- `DOC_DRIFT.md`

## Summary of Fixes

- Corrected `AsyncInjectable<T>` type signature in `docs/ARCHITECTURE.md` to match `src/injection-keys.ts`.
- Replaced `AppError` with `BaseError (from @babadeluxe/shared)` in `docs/HTTP.md`.
- Annotated `webdav-adapter.ts` and `sftp-adapter.ts` as `(in progress / planned)` in `docs/SYNC_DESIGN.md` file tree.
- Updated `README.md` Scripts table to include `lint` and clarify `format` behavior.
