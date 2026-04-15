import type { Result } from 'neverthrow'
import type { NetworkError } from '@/errors'
import type { UserSettingWithValidation } from '@babadeluxe/shared'

export interface SettingsRepository {
  loadSettings(): Promise<Result<UserSettingWithValidation[], NetworkError>>
  upsertSetting(
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ): Promise<Result<void, NetworkError>>
  deleteSetting(settingKey: string): Promise<Result<void, NetworkError>>
}
