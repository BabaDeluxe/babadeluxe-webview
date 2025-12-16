import Dexie, { type Table } from 'dexie'
import type { KeyValuePair } from '@/database/types'

export class KeyValueDb extends Dexie {
  keyValue!: Table<KeyValuePair, string>

  constructor() {
    super('KeyValueStore')

    this.version(1).stores({
      keyValue: 'key, updatedAt',
    })

    this.keyValue.hook('creating', (_, object) => {
      object.updatedAt = new Date()
    })

    this.keyValue.hook('updating', () => ({ updatedAt: new Date() }))
  }
}
