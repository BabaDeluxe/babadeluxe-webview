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

export class MessageNotFoundError extends BaseError {
  constructor(public readonly messageId: string | number) {
    super(`Message with ID ${messageId} not found`)
  }
}

export class InvalidModelFormatError extends BaseError {
  constructor(public readonly modelId: string) {
    super(`Invalid model format: ${modelId}. Expected format: 'provider:model'`)
  }
}

export class MessageCreationError extends BaseError {
  constructor(
    public readonly role: 'user' | 'assistant',
    cause?: Error
  ) {
    super(`Failed to create ${role} message`, cause)
  }
}

export class NoUserMessageError extends BaseError {
  constructor(public readonly assistantMessageId: string | number) {
    super(`Cannot rewrite: no user message found before assistant message ${assistantMessageId}`)
  }
}
