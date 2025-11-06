import { type KeyValueDb } from './key-value-db'

export class KeyValueStore {
  constructor(private readonly _keyValueDb: KeyValueDb) {}

  async get(key: string): Promise<string | undefined> {
    const record = await this._keyValueDb.keyValue.get(key)
    return record?.value
  }

  async set(key: string, value: string): Promise<void> {
    await this._keyValueDb.keyValue.put({ key, value, updatedAt: new Date() })
  }

  async remove(key: string): Promise<void> {
    await this._keyValueDb.keyValue.delete(key)
  }

  async has(key: string): Promise<boolean> {
    const record = await this._keyValueDb.keyValue.get(key)
    return record !== undefined
  }

  async clear(): Promise<void> {
    await this._keyValueDb.keyValue.clear()
  }
}
