import { settingMetadata, settingSchemas, type UserSettingWithValidation } from '@babadeluxe/shared'

/**
 * Wire-safe setting type (Date → ISO string for socket transmission)
 */
type UserSettingWire = Omit<UserSettingWithValidation, 'updatedAt'> & {
  readonly updatedAt: string
}

/**
 * Setting key union type
 */
type SettingKey = keyof typeof settingSchemas

/**
 * Type guard to ensure a string is a valid SettingKey.
 */
function isSettingKey(key: string): key is SettingKey {
  return key in settingSchemas
}

/**
 * Transform wire format back to runtime type (ISO string → Date)
 */
export function fromWire(newSettings: UserSettingWire[]): UserSettingWithValidation[] {
  const result: UserSettingWithValidation[] = newSettings.map((newSetting) => {
    return {
      ...newSetting,
      updatedAt: new Date(newSetting.updatedAt),
    }
  })
  return result
}

/**
 * Get all setting keys in a specific category.
 */
export function getSettingsByCategory(category: string): SettingKey[] {
  const keys: SettingKey[] = []

  for (const [key, meta] of Object.entries(settingMetadata)) {
    if (meta.category !== category || !isSettingKey(key)) continue
    keys.push(key)
  }

  return keys
}

/**
 * Get formatted list of all API providers for UI.
 */
export function getApiProviders() {
  return getSettingsByCategory('apiKey').map((key) => {
    const meta = settingMetadata[key]
    const schema = settingSchemas[key]
    let name = key.replace('apiKey', '')
    if (name === 'Openai') name = 'OpenAI'

    return {
      key,
      name,
      required: meta.required,
      description: schema.description,
    }
  })
}
