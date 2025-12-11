import type { Table } from 'dexie'
import { ok, err, type Result } from 'neverthrow'
import type { KeyValuePair } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import type { KeyValueDb } from '@/database/key-value-db'
import { SafeTable, type DexieError } from '@/database/safe-table'
import { BaseError } from '@/base-error'

export class KeyValueStoreError extends BaseError {}

export class KeyValueStore {
  private _table: Table<KeyValuePair, string>
  private _safe: SafeTable<KeyValuePair, KeyValuePair, string> // All 3 params

  constructor(
    private readonly _keyValueDb: KeyValueDb,
    private readonly _logger: ConsoleLogger
  ) {
    this._table = this._keyValueDb.keyValue
    this._safe = new SafeTable(this._table)
  }

  async get(key: string): Promise<Result<string | undefined, KeyValueStoreError>> {
    const result = await this._safe.get(key)

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, `Failed to get key "${key}" from Dexie`)
      this._logger.error(mapped)
      return err(mapped)
    }

    return ok(result.value?.value)
  }

  async set(key: string, value: string): Promise<Result<void, KeyValueStoreError>> {
    const result = await this._safe.put({ key, value, updatedAt: new Date() })

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, `Failed to set key "${key}" in Dexie`)
      this._logger.error(mapped)
      return err(mapped)
    }

    return ok(undefined)
  }

  async remove(key: string): Promise<Result<void, KeyValueStoreError>> {
    const result = await this._safe.delete(key)

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, `Failed to remove key "${key}" from Dexie`)
      this._logger.error(mapped)
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
      this._logger.error(mapped)
      return err(mapped)
    }

    return ok(result.value !== undefined)
  }

  async clear(): Promise<Result<void, KeyValueStoreError>> {
    const result = await this._safe.clear()

    if (result.isErr()) {
      const mapped = this._toStoreError(result.error, 'Failed to clear Dexie')
      this._logger.error(mapped)
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
