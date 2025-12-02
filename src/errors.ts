import { BaseError } from './base-error'

export class DbError extends BaseError {}
export class StorageError extends BaseError {}
export class ParseError extends BaseError {}

export class SearchError extends BaseError {}

export class PromptError extends BaseError {}

export class SessionParseError extends BaseError {}

export class KvStoreError extends BaseError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
  }
}

export class KvNotFoundError extends KvStoreError {}
export class KvQuotaExceededError extends KvStoreError {}
export class KvVersionError extends KvStoreError {}
export class KvDatabaseClosedError extends KvStoreError {}

export class InvalidApiKeyError extends BaseError {}
export class BadRequestError extends BaseError {}
export class LlmRateLimitedError extends BaseError {}
export class NetworkValidationError extends BaseError {}
export class ServerValidationError extends BaseError {}
export class UnsupportedProviderError extends BaseError {}
export class ValidationTimeoutError extends BaseError {}
// export class SocketConnectionError extends BaseError {}
export class InvalidResponseError extends BaseError {}

export class SocketConnectionError extends BaseError {
  constructor(
    public readonly namespace: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`[${namespace}] ${message}`)
    this.name = 'SocketConnectionError'
    Object.setPrototypeOf(this, SocketConnectionError.prototype)
  }
}

export class SocketConnectionTimeoutError extends BaseError {
  constructor(
    public readonly namespace: string,
    public readonly timeoutMs: number
  ) {
    super(`[${namespace}] Connection timeout after ${timeoutMs}ms`)
    this.name = 'SocketConnectionTimeoutError'
    Object.setPrototypeOf(this, SocketConnectionTimeoutError.prototype)
  }
}

export type ApiKeyValidationError =
  | InvalidApiKeyError
  | BadRequestError
  | LlmRateLimitedError
  | NetworkValidationError
  | ServerValidationError
  | UnsupportedProviderError
  | ValidationTimeoutError
  | SocketConnectionError
  | InvalidResponseError
