import { z } from 'zod'

export const modelPreferencesSchema = z.object({
  preferredModels: z.array(z.string()).default(['flash-2.0', 'flash']),
})

export type ModelPreferences = z.infer<typeof modelPreferencesSchema>

export const defaultModelPreferences: ModelPreferences = {
  preferredModels: ['flash-2.0', 'flash'],
}

export function findPreferredModel<T extends { label: string; value: string }>(
  models: T[],
  preferences: string[] = defaultModelPreferences.preferredModels
): T | undefined {
  if (models.length === 0) return undefined

  // Check each preference in priority order
  for (const preference of preferences) {
    const match = models.find((model) =>
      model.label.toLowerCase().includes(preference.toLowerCase())
    )
    if (match) return match
  }

  // Fallback to first model if no preferences match
  return models[0]
}
