import { BaseError } from '@babadeluxe/shared'
export { BaseError }
export class DbError extends BaseError {}
export class ValidationError extends BaseError {}
export class ChatError extends BaseError {}

export class NetworkError extends BaseError {}
export class SocketError extends BaseError {}

export type SocketConnectionError = NetworkError | SocketError

export class AuthError extends BaseError {}
export class InitializationError extends BaseError {}
export class RateLimitError extends BaseError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    cause?: unknown
  ) {
    super(message, cause)
  }
}

export class InvalidModelFormatError extends BaseError {
  constructor(
    public readonly modelId: string,
    cause?: unknown
  ) {
    super(`Invalid model format: ${modelId}. Expected format: 'provider:model'`, cause)
  }
}

export class MessageCreationError extends BaseError {
  constructor(
    public readonly role: 'user' | 'assistant',
    cause?: unknown
  ) {
    super(`Failed to create ${role} message`, cause)
  }
}

export class MessageUpdateError extends BaseError {
  constructor(
    public readonly messageId: string | number,
    cause?: unknown
  ) {
    super(`Failed to update message ${messageId}`, cause)
  }
}

export class MessageNotFoundError extends BaseError {
  constructor(
    public readonly messageId: string | number,
    cause?: unknown
  ) {
    super(`Message with ID ${messageId} not found`, cause)
  }
}

export class VsCodeAcquireError extends BaseError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
  }
}

export type ApiKeyValidationError = NetworkError | ValidationError | RateLimitError

export type CreateOrResetAssistantError =
  | ChatError
  | MessageNotFoundError
  | MessageCreationError
  | MessageUpdateError

export class UnexpectedAppError extends BaseError {}
