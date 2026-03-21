import { getSettingDefinition } from '@babadeluxe/shared'
import type { UserSettingWithValidation, Root } from '@babadeluxe/shared'

type SettingsUpdatedPayload = Parameters<Root.Emission['settings:updated']>[0]

/**
 * Pure function to merge a partial update into an existing settings array.
 * Returns a new array (immutable update).
 */
export function mergePartialUpdate(
  settings: UserSettingWithValidation[],
  update: SettingsUpdatedPayload
): UserSettingWithValidation[] {
  const index = settings.findIndex((s) => s.settingKey === update.settingKey)

  // New setting: build full metadata + value
  if (index === -1) {
    const definition = getSettingDefinition(update.settingKey)
    // Unknown setting key: ignore this update
    if (!definition) return settings

    const newSetting: UserSettingWithValidation = {
      settingKey: update.settingKey,
      settingValue: update.settingValue,
      updatedAt: new Date(update.updatedAt),
      ...definition,
    }

    return [...settings, newSetting]
  }

  // Existing setting: update value fields, keep metadata
  const updated = [...settings]
  updated[index] = {
    ...updated[index],
    dataType: update.dataType as 'string' | 'number' | 'boolean',
    settingValue: update.settingValue,
    updatedAt: new Date(update.updatedAt),
  }

  return updated
}
