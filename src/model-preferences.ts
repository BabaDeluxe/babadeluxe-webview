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

  for (const preference of preferences) {
    const match = models.find((model) =>
      model.label.toLowerCase().includes(preference.toLowerCase())
    )
    if (match) return match
  }

  return models[0]
}

/**
 * Human-readable temperature label shown in the UI tooltip.
 *
 * 0.0–0.3  → Precise
 * 0.4–0.7  → Balanced
 * 0.8–1.2  → Creative
 * 1.3–2.0  → Wild
 */
export function temperatureLabel(value: number): string {
  if (value <= 0.3) return 'Precise'
  if (value <= 0.7) return 'Balanced'
  if (value <= 1.2) return 'Creative'
  return 'Wild'
}
