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

// PromptFormatter lives in formatter-interface.ts — importing it here would
// create a circular dependency (PromptFormatter → PromptDag → types.ts).
// Import it directly from './formatter-interface.js' when needed.
