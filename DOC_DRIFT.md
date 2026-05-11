# Document Drift Report

This file documents discrepancies between the codebase implementation and the project's markdown documentation.

## docs/ENVS.md vs src/env-validator.ts

1.  **Required Variables:**
    *   `docs/ENVS.md` states that `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SOCKET_URL` are always required.
    *   `src/env-validator.ts` makes them optional in the Zod schema and uses a `superRefine` to only require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if `VITE_OFFLINE_MODE` is not enabled.
2.  **Missing Variables:**
    *   `docs/ENVS.md` does not mention `VITE_OFFLINE_MODE`, `VITE_GA_MEASUREMENT_ID`, or `VITE_STATSIG_CLIENT_KEY`.
3.  **Boot Validation Example:**
    *   The example Zod schema in `docs/ENVS.md` is much simpler and outdated compared to the implementation in `src/env-validator.ts`.
    *   The implementation uses `neverthrow` (`Result` type) for returning validation results, which is not mentioned in `docs/ENVS.md`.

## docs/ARCHITECTURE.md vs src/injection-keys.ts

1.  **Injection Keys:**
    *   `docs/ARCHITECTURE.md` mentions `APP_DB_KEY` and `LOGGER_KEY`.
    *   `src/injection-keys.ts` includes many more: `ENV_CONFIG_KEY`, `SEARCH_SERVICE_KEY`, `KEY_VALUE_STORE_KEY`, `SUPABASE_CLIENT_KEY`, `SOCKET_MANAGER_KEY`, `ANALYTICS_MANAGER_KEY`, `API_KEY_VALIDATOR_KEY`, `AUTH_PROVIDER_KEY`, and `VSCODE_BRIDGE_KEY`.

## docs/AUTH.md vs src/auth/

1.  **Auth Providers:**
    *   `docs/AUTH.md` mentions VS Code token bridge and Supabase PKCE OAuth.
    *   The codebase (`src/auth/zitadel-auth-provider.ts`) suggests there might be support for Zitadel, which is not mentioned in the docs.
