# Required External Changes

The following changes are required in external packages to support the current BabaDeluxe Webview implementation.

## @babadeluxe/shared

### Missing Exports

The following types and constants are currently missing from the exported API of `@babadeluxe/shared` but are required by `PromptInjectionSettings.vue` and `prompt-injection-service.ts`:

- `PromptInjectionMode` (type)
- `PromptInjectionPosition` (type)
- `PROMPT_INJECTION_DEFAULTS` (constant)

**Temporary Workaround**:
These types and the default constant have been manually defined in `src/services/prompt-injection-service.ts` within the webview repository.

**Action Required**:
Update `@babadeluxe/shared` to include and export these members, then update the webview to import them from the package.
