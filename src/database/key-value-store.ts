import type { Table } from 'dexie'
import { ok, err, type Result } from 'neverthrow'
import type { KeyValuePair } from '@/database/types'
import type { AbstractLogger } from '@/logger'
import type { KeyValueDb } from '@/database/key-value-db'
import { SafeTable, type DexieError } from '@/database/safe-table'
import { BaseError } from '@babadeluxe/shared'

export class KeyValueStoreError extends BaseError {}

export class KeyValueStore {
  private _table: Table<KeyValuePair, string>
  private _safe: SafeTable<KeyValuePair, KeyValuePair, string>

  constructor(
    private readonly _keyValueDb: KeyValueDb,
    private readonly _logger: AbstractLogger
  ) {
    this._table = this._keyValueDb.keyValue
    this._safe = new SafeTable(this._table)
  }

  async get(key: string): Promise<Result<string | undefined, KeyValueStoreError>> {
    const result = await this._safe.get(key)

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, `Failed to get key "${key}" from Dexie`)
      this._logger.error('Failed to get key from key-value store', {
        key,
        error: mapped,
      })
      return err(mapped)
    }

    return ok(result.value?.value)
  }

  async set(key: string, value: string): Promise<Result<void, KeyValueStoreError>> {
    const result = await this._safe.put({ key, value, updatedAt: new Date() })

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, `Failed to set key "${key}" in Dexie`)
      this._logger.error('Failed to set key in key-value store', {
        key,
        error: mapped,
      })
      return err(mapped)
    }

    return ok(undefined)
  }

  async remove(key: string): Promise<Result<void, KeyValueStoreError>> {
    const result = await this._safe.delete(key)

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, `Failed to remove key "${key}" from Dexie`)
      this._logger.error('Failed to remove key from key-value store', {
        key,
        error: mapped,
      })
      return err(mapped)
    }

    return ok(undefined)
  }

  async has(key: string): Promise<Result<boolean, KeyValueStoreError>> {
    const result = await this._safe.get(key)

    if (result.isErr()) {
      const mapped = this._toStoreError(
        result.error,
        `Failed to check existence of key "${key}" in Dexie`
      )
      this._logger.error('Failed to check key existence in key-value store', {
        key,
        error: mapped,
      })
      return err(mapped)
    }

    return ok(result.value !== undefined)
  }

  async clear(): Promise<Result<void, KeyValueStoreError>> {
    const result = await this._safe.clear()

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, 'Failed to clear Dexie')
      this._logger.error('Failed to clear key-value store', {
        error: mapped,
      })
      return err(mapped)
    }

    return ok(undefined)
  }

  private _toStoreError(error: DexieError, message: string): KeyValueStoreError {
    return new KeyValueStoreError(
      `${message} (operation: ${error.operation}, table: ${error.tableName})`,
      error
    )
  }
}
