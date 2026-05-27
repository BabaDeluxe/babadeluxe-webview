export interface PromptPartPOJO {
  id: string
  content: string
  requiredCapabilities?: string[]
}

export interface TaskNode {
  taskId: string
  partId: string
  content: string
  requiredCapabilities: string[]
  dependsOn: string[]
}

export interface PromptPresetPOJO extends PromptPartPOJO {
  presetId: string
  category?: string
  repeat?: number
  defaultEnabled?: boolean
  description?: string
}

export interface PromptFormatter {
  generate(dag: PromptDag, systemCapabilities: Set<string>): string
}

// Forward-declare to avoid circular import — PromptDag is imported by consumers
import type { PromptDag } from './prompt-dag.js'
export type { PromptDag }
