// Extracted from types.ts to break the circular import:
// types.ts → prompt-dag.ts → types.ts (via PromptFormatter referencing PromptDag)
import type { PromptDag } from './prompt-dag.js'

export interface PromptFormatter {
  generate(dag: PromptDag, systemCapabilities: Set<string>): string
}
