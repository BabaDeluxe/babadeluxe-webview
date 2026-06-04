# Required External Changes

The following changes are required in external packages to support the current BabaDeluxe Webview implementation.

## @babadeluxe/shared

### Consolidation of Feature Branches

I have consolidated the following feature branches in the `babadeluxe-shared` repository into a single coherent state:

- `feat/prompt-injection-settings`
- `feat/temperature-per-model`

### Missing Exports

The following types and constants are currently missing from the exported API of `@babadeluxe/shared` but are required by `PromptInjectionSettings.vue` and `prompt-injection-service.ts`:

- `PromptInjectionMode` (type)
- `PromptInjectionPosition` (type)
- `PROMPT_INJECTION_DEFAULTS` (constant)
- `ModelTemperatures` (type)
- `DEFAULT_TEMPERATURE` (constant)
- Helper functions: `getModelTemperature`, `setModelTemperature`, `resetModelTemperature`.

**Action Taken**:
I have manually implemented these types and defaults in `src/services/prompt-injection-service.ts` within the webview repository as a temporary workaround.

**Action Required**:
A PR should be opened in `@babadeluxe/shared` merging `feat/prompt-injection-settings` and `feat/temperature-per-model` and ensuring all types/helpers are properly exported. I have verified the merge logic locally.

### Missing Prompt Fields

The following fields are currently missing from the `Prompt` type in `@babadeluxe/shared/generated-socket-types`:

- `isPremium`: boolean (optional)

**Action Taken**:
I have manually augmented the `Prompt` type in `src/composables/use-prompts-socket.ts` with `isPremium?: boolean`.

**Action Required**:
Update the backend schema and socket type generation to include `isPremium` in the `Prompt` object.
