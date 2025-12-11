import type { WhereClause, IndexableType } from 'dexie'
import { SafeCollection } from '@/database/safe-collection'

export class SafeWhereClause<T, TKey> {
  constructor(
    private readonly _whereClause: WhereClause<T, TKey>,
    private readonly _context: string
  ) {}

  equals(key: IndexableType): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.equals(key), this._context)
  }

  above(key: IndexableType): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.above(key), this._context)
  }

  below(key: IndexableType): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.below(key), this._context)
  }

  between(
    lower: IndexableType,
    upper: IndexableType,
    includeLower?: boolean,
    includeUpper?: boolean
  ): SafeCollection<T, TKey> {
    return new SafeCollection(
      this._whereClause.between(lower, upper, includeLower, includeUpper),
      this._context
    )
  }

  anyOf(keys: readonly IndexableType[]): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.anyOf(keys as IndexableType[]), this._context)
  }

  startsWith(prefix: string): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.startsWith(prefix), this._context)
  }

  aboveOrEqual(key: IndexableType): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.aboveOrEqual(key), this._context)
  }

  belowOrEqual(key: IndexableType): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.belowOrEqual(key), this._context)
  }

  notEqual(key: IndexableType): SafeCollection<T, TKey> {
    return new SafeCollection(this._whereClause.notEqual(key), this._context)
  }

  startsWithAnyOf(prefixes: readonly string[]): SafeCollection<T, TKey> {
    return new SafeCollection(
      this._whereClause.startsWithAnyOf(prefixes as string[]),
      this._context
    )
  }
}
