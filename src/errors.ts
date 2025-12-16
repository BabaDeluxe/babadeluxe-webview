import { BaseError } from '@babadeluxe/shared'

export class DbError extends BaseError {}

export class SearchError extends BaseError {}

export class PromptError extends BaseError {}

export class SessionParseError extends BaseError {}

export class InvalidApiKeyError extends BaseError {}
export class BadRequestError extends BaseError {}
export class LlmRateLimitedError extends BaseError {}
export class NetworkValidationError extends BaseError {}
export class ServerValidationError extends BaseError {}
export class UnsupportedProviderError extends BaseError {}
export class ValidationTimeoutError extends BaseError {}
export class InvalidResponseError extends BaseError {}

export class SocketConnectionError extends BaseError {}

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

export class EnvValidationError extends BaseError {}

export class AuthTokenError extends BaseError {}

export class ModelsFetchError extends BaseError {}
export class PostMessageError extends BaseError {}

export class TestEnvValidationError extends BaseError {}

export class SubscriptionError extends BaseError {}

export class ChatError extends BaseError {}
export class NetworkError extends BaseError {}
export class RateLimitError extends BaseError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    cause?: Error
  ) {
    super(message, cause)
  }
}
