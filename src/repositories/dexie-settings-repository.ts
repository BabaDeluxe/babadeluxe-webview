import { err, ok } from 'neverthrow'
import { NetworkError } from '@/errors'
import type { AppDb } from '@/database/app-db'
import type { SettingsRepository } from './settings-repository'
import { getSettingDefinition, type UserSettingWithValidation } from '@babadeluxe/shared'

export class DexieSettingsRepository implements SettingsRepository {
  constructor(private readonly _db: AppDb) {}

  async loadSettings() {
    const result = await this._db.localSetting.toArray()
    if (result.isErr()) {
      return err(new NetworkError('Failed to load local settings', result.error))
    }

    const validSettings: UserSettingWithValidation[] = result.value
      .map((s) => {
        const definition = getSettingDefinition(s.settingKey)
        if (!definition) return undefined
        return {
          ...s,
          ...definition,
        } as UserSettingWithValidation
      })
      .filter((s): s is UserSettingWithValidation => s !== undefined)

    return ok(validSettings)
  }

  async upsertSetting(
    settingKey: string,
    settingValue: unknown,
    dataType: 'string' | 'number' | 'boolean'
  ) {
    const updatedAt = new Date()
    const result = await this._db.localSetting.where('settingKey').equals(settingKey).first()

    if (result.isErr()) {
      return err(new NetworkError('Failed to check existing setting', result.error))
    }

    if (result.value) {
      const updateResult = await this._db.localSetting.update(result.value.id!, {
        settingValue,
        dataType,
        updatedAt,
      })
      if (updateResult.isErr()) {
        return err(new NetworkError('Failed to update local setting', updateResult.error))
      }
    } else {
      const addResult = await this._db.localSetting.add({
        settingKey,
        settingValue,
        dataType,
        updatedAt,
      })
      if (addResult.isErr()) {
        return err(new NetworkError('Failed to add local setting', addResult.error))
      }
    }

    return ok(undefined)
  }

  async deleteSetting(settingKey: string) {
    const result = await this._db.localSetting.where('settingKey').equals(settingKey).first()
    if (result.isErr()) {
      return err(new NetworkError('Failed to find setting to delete', result.error))
    }

    if (result.value) {
      const deleteResult = await this._db.localSetting.delete(result.value.id!)
      if (deleteResult.isErr()) {
        return err(new NetworkError('Failed to delete local setting', deleteResult.error))
      }
    }

    return ok(undefined)
  }
}
