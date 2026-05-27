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

// PromptFormatter lives in formatter-interface.ts to avoid a circular import
// (PromptFormatter references PromptDag, which imports from types.ts).
export type { PromptFormatter } from './formatter-interface.js'
