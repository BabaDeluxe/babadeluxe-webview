# Required External Changes

The following changes are required in external packages to support the current BabaDeluxe Webview implementation.

## @babadeluxe/shared

### Consolidation of Feature Branches

✅ **Resolved** — [babadeluxe-shared PR #7](https://github.com/BabaDeluxe/babadeluxe-shared/pull/7) (`feat/temperature-per-model-v2`) consolidates:

- `feat/prompt-injection-settings`
- `feat/temperature-per-model`

### Previously Missing Exports

✅ **All resolved in shared PR #7.** The following are now exported from `@babadeluxe/shared`:

| Export | Kind | Notes |
|---|---|---|
| `PromptInjectionMode` | type | |
| `PromptInjectionPosition` | type | |
| `promptInjectionDefaults` | const | camelCase (was `PROMPT_INJECTION_DEFAULTS` in earlier drafts) |
| `ModelTemperatures` | type | |
| `defaultTemperature` | const | camelCase (was `DEFAULT_TEMPERATURE` in earlier drafts) |
| `getModelTemperature` | function | |
| `setModelTemperature` | function | |
| `resetModelTemperature` | function | |

### Webview Workarounds Removed

This PR removes the local workarounds that were in place while shared PR #7 was pending:

- `src/services/prompt-injection-service.ts` — local `PromptInjectionMode`, `PromptInjectionPosition`, `promptInjectionDefaults` definitions removed; now re-exported from `@babadeluxe/shared`
- `src/views/SettingsView.vue` — inline `ModelTemperatures` type, `setModelTemperature`, and `resetModelTemperature` copies removed; imported from `@babadeluxe/shared`
- `getTemperatureForModel` now returns `defaultTemperature` (1.0) instead of `undefined` when no override exists, matching the shared helper contract

### Action Required Before Merging This PR

- Merge [babadeluxe-shared PR #7](https://github.com/BabaDeluxe/babadeluxe-shared/pull/7) first
- Bump `@babadeluxe/shared` to the version that includes PR #7
