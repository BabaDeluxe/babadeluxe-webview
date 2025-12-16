import { BaseError } from '@babadeluxe/shared'
import type { Table } from 'dexie'
import { ResultAsync, type Result } from 'neverthrow'
import { SafeCollection } from '@/database/safe-collection'
import { SafeWhereClause } from '@/database/safe-where-clause'

export class DexieError extends BaseError {
  constructor(
    public readonly operation: string,
    public readonly tableName: string,
    cause: Error
  ) {
    super(`operation '${operation}' failed on table '${tableName}'`, cause)
  }
}

export class SafeTable<T extends TInsert, TInsert, TKey = number> {
  constructor(private readonly _table: Table<T, TKey>) {}

  async add(item: TInsert, key?: TKey): Promise<Result<TKey, DexieError>> {
    return await ResultAsync.fromPromise(this._table.add(item as T, key), (error) =>
      this._createError('add', error)
    )
  }

  async put(item: TInsert, key?: TKey): Promise<Result<TKey, DexieError>> {
    return await ResultAsync.fromPromise(this._table.put(item as T, key), (error) =>
      this._createError('put', error)
    )
  }

  async get(key: TKey): Promise<Result<T | undefined, DexieError>> {
    return await ResultAsync.fromPromise(this._table.get(key), (error) =>
      this._createError('get', error)
    )
  }

  async delete(key: TKey): Promise<Result<void, DexieError>> {
    return await ResultAsync.fromPromise(this._table.delete(key), (error) =>
      this._createError('delete', error)
    )
  }

  async update(
    key: Parameters<Table<T, TKey>['update']>[0],
    changes: Parameters<Table<T, TKey>['update']>[1]
  ): Promise<Result<number, DexieError>> {
    return await ResultAsync.fromPromise(this._table.update(key, changes), (error) =>
      this._createError('update', error)
    )
  }

  async clear(): Promise<Result<void, DexieError>> {
    return await ResultAsync.fromPromise(this._table.clear(), (error) =>
      this._createError('clear', error)
    )
  }

  async bulkAdd(
    items: TInsert[],
    keys?: Parameters<Table<T, TKey>['bulkAdd']>[1],
    options?: Parameters<Table<T, TKey>['bulkAdd']>[2]
  ): Promise<Result<TKey, DexieError>> {
    return await ResultAsync.fromPromise(
      this._table.bulkAdd(items as T[], keys, options),
      (error) => this._createError('bulkAdd', error)
    )
  }

  async bulkPut(
    items: TInsert[],
    keys?: Parameters<Table<T, TKey>['bulkPut']>[1],
    options?: Parameters<Table<T, TKey>['bulkPut']>[2]
  ): Promise<Result<TKey, DexieError>> {
    return await ResultAsync.fromPromise(
      this._table.bulkPut(items as T[], keys, options),
      (error) => this._createError('bulkPut', error)
    )
  }

  async bulkGet(
    keys: Parameters<Table<T, TKey>['bulkGet']>[0]
  ): Promise<Result<(T | undefined)[], DexieError>> {
    return await ResultAsync.fromPromise(this._table.bulkGet(keys), (error) =>
      this._createError('bulkGet', error)
    )
  }

  async bulkDelete(
    keys: Parameters<Table<T, TKey>['bulkDelete']>[0]
  ): Promise<Result<void, DexieError>> {
    return await ResultAsync.fromPromise(this._table.bulkDelete(keys), (error) =>
      this._createError('bulkDelete', error)
    )
  }

  async count(): Promise<Result<number, DexieError>> {
    return await ResultAsync.fromPromise(this._table.count(), (error) =>
      this._createError('count', error)
    )
  }

  async toArray(): Promise<Result<T[], DexieError>> {
    return await ResultAsync.fromPromise(this._table.toArray(), (error) =>
      this._createError('toArray', error)
    )
  }

  where(index: string): SafeWhereClause<T, TKey> {
    return new SafeWhereClause(this._table.where(index), this._table.name)
  }

  filter(filterFunction: (obj: T) => boolean): SafeCollection<T, TKey> {
    return new SafeCollection(this._table.filter(filterFunction), this._table.name)
  }

  orderBy(index: string): SafeCollection<T, TKey> {
    return new SafeCollection(this._table.orderBy(index), this._table.name)
  }

  limit(n: number): SafeCollection<T, TKey> {
    return new SafeCollection(this._table.limit(n), this._table.name)
  }

  offset(n: number): SafeCollection<T, TKey> {
    return new SafeCollection(this._table.offset(n), this._table.name)
  }

  get name(): string {
    return this._table.name
  }

  get schema() {
    return this._table.schema
  }

  private _createError(operation: string, error: unknown): DexieError {
    return new DexieError(operation, this._table.name, error as Error)
  }
}
