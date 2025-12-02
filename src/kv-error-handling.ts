import Dexie from 'dexie'
import {
  KvStoreError,
  KvNotFoundError,
  KvQuotaExceededError,
  KvVersionError,
  KvDatabaseClosedError,
} from './errors'

export type KvError = {
  readonly name: string
  readonly code: string
  readonly message: string
  readonly cause?: Error
}

export const toKvError = (error: unknown): KvError => {
  // Handle Dexie-specific errors
  if (error instanceof Error && isDexieError(error)) {
    const wrappedError = wrapDexieError(error)
    return {
      name: wrappedError.name,
      code: namespaceToCode(wrappedError.namespace),
      message: wrappedError.message,
      cause: wrappedError.cause,
    }
  }

  // Preserve existing BaseError instances
  if (error instanceof KvStoreError) {
    return {
      name: error.name,
      code: namespaceToCode(error.namespace),
      message: error.message,
      cause: error.cause,
    }
  }

  // Handle generic Error instances
  if (error instanceof Error) {
    return {
      name: error.name,
      code: 'KV_STORE_ERROR',
      message: error.message,
    }
  }

  // Fallback for unknown errors
  return {
    name: 'KvStoreError',
    code: 'KV_STORE_UNKNOWN_ERROR',
    message: String(error),
  }
}

function isDexieError(error: Error): boolean {
  return error.name.startsWith('Dexie') || error instanceof Dexie.DexieError
}

function wrapDexieError(error: Error): KvStoreError {
  const errorName = error.name

  switch (errorName) {
    case 'NotFoundError':
    case 'Dexie.NotFoundError':
      return new KvNotFoundError('Key not found in store', error)

    case 'QuotaExceededError':
    case 'Dexie.QuotaExceededError':
      return new KvQuotaExceededError('Storage quota exceeded', error)

    case 'VersionError':
    case 'Dexie.VersionError':
      return new KvVersionError('Database version conflict', error)

    case 'DatabaseClosedError':
    case 'Dexie.DatabaseClosedError':
      return new KvDatabaseClosedError('Database connection closed', error)

    default:
      return new KvStoreError(`Dexie operation failed: ${error.message}`, error)
  }
}

function namespaceToCode(namespace: string): string {
  const codeMap: Record<string, string> = {
    KvNotFound: 'KV_STORE_NOT_FOUND',
    KvQuotaExceeded: 'KV_STORE_QUOTA_EXCEEDED',
    KvVersion: 'KV_STORE_VERSION_ERROR',
    KvDatabaseClosed: 'KV_STORE_DATABASE_CLOSED',
    KvStore: 'KV_STORE_ERROR',
  }

  return codeMap[namespace] ?? 'KV_STORE_ERROR'
}
