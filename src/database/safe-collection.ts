import type { Collection } from 'dexie'
import { ResultAsync, type Result } from 'neverthrow'
import { DexieError } from '@/database/safe-table'

export class SafeCollection<T, TKey> {
  constructor(
    private readonly _collection: Collection<T, TKey>,
    private readonly _tableName: string
  ) {}

  filter(filterFunction: (obj: T) => boolean): SafeCollection<T, TKey> {
    return new SafeCollection(this._collection.filter(filterFunction), this._tableName)
  }

  limit(n: number): SafeCollection<T, TKey> {
    return new SafeCollection(this._collection.limit(n), this._tableName)
  }

  offset(n: number): SafeCollection<T, TKey> {
    return new SafeCollection(this._collection.offset(n), this._tableName)
  }

  async toArray(): Promise<Result<T[], DexieError>> {
    return await ResultAsync.fromPromise(
      this._collection.toArray(),
      (error) => new DexieError('toArray', this._tableName, error as Error)
    )
  }

  async sortBy(keyPath: string): Promise<Result<T[], DexieError>> {
    return await ResultAsync.fromPromise(
      this._collection.sortBy(keyPath),
      (error) => new DexieError('sortBy', this._tableName, error as Error)
    )
  }

  async count(): Promise<Result<number, DexieError>> {
    return await ResultAsync.fromPromise(
      this._collection.count(),
      (error) => new DexieError('count', this._tableName, error as Error)
    )
  }

  async first(): Promise<Result<T | undefined, DexieError>> {
    return await ResultAsync.fromPromise(
      this._collection.first(),
      (error) => new DexieError('first', this._tableName, error as Error)
    )
  }

  async last(): Promise<Result<T | undefined, DexieError>> {
    return await ResultAsync.fromPromise(
      this._collection.last(),
      (error) => new DexieError('last', this._tableName, error as Error)
    )
  }

  async delete(): Promise<Result<number, DexieError>> {
    return await ResultAsync.fromPromise(
      this._collection.delete(),
      (error) => new DexieError('delete', this._tableName, error as Error)
    )
  }
}
