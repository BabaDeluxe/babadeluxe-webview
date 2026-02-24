const _sharedDataMap = new Map<string, unknown>()

export const storage = {
  addOrUpdate(key: string, value: unknown) {
    _sharedDataMap.set(key, value)
  },
  get<T>(key: string) {
    return _sharedDataMap.get(key) as T | undefined
  },
}
