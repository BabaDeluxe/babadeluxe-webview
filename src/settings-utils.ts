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
 * Transform wire format back to runtime type (ISO string → Date)
 */
export function fromWire(setting: UserSettingWire): UserSettingWithValidation {
  return {
    ...setting,
    updatedAt: new Date(setting.updatedAt),
  }
}

/**
 * Get all setting keys in a specific category.
 */
export function getSettingsByCategory(category: string): SettingKey[] {
  return Object.entries(settingMetadata)
    .filter(([, meta]) => meta.category === category)
    .map(([key]) => key as SettingKey)
}

/**
 * Get formatted list of all API providers for UI.
 */
export function getApiProviders() {
  return getSettingsByCategory('apiKey').map((key) => {
    const meta = settingMetadata[key]
    const schema = settingSchemas[key]
    let name = key.replace('apiKey', '')

    // Fix casing for specific providers
    if (name === 'Openai') name = 'OpenAI'

    return {
      key,
      name,
      required: meta.required,
      description: schema.description,
    }
  })
}
