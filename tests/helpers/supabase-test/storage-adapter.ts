import type { SupportedStorage } from '@supabase/supabase-js'
import { storage } from '../storage'

export const noopStorage = {
  getItem: () => null,

  setItem() {},

  removeItem() {},
}

export function createStorageAdapter(storageKey: string): SupportedStorage {
  const prefixKey = (key: string): string => `${storageKey}-----${key}`

  return {
    getItem(key: string) {
      return storage.get<string>(prefixKey(key)) ?? null
    },
    setItem(key: string, value: string) {
      storage.addOrUpdate(prefixKey(key), value)
    },
    removeItem(key: string) {
      storage.addOrUpdate(prefixKey(key), undefined)
    },
  }
}
