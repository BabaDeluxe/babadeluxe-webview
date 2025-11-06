import { ok, err, type Result } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketService } from './socket-service'
import type { Validation } from '@babadeluxe/shared/generated-socket-types'

type ValidationSuccess =
  | {
      readonly type: 'valid'
      readonly provider: string
      readonly statusCode: number
    }
  | {
      readonly type: 'recognized'
      readonly provider: string
      readonly statusCode: number
      readonly reason: 'bad_request' | 'rate_limited'
    }

type ValidationError =
  | { readonly type: 'invalid_key'; readonly provider: string; readonly statusCode: number }
  | { readonly type: 'network_error'; readonly provider: string; readonly cause: unknown }
  | { readonly type: 'server_error'; readonly provider: string; readonly statusCode: number }
  | { readonly type: 'unsupported_provider'; readonly provider: string }

export type ValidationResult = ValidationSuccess | ValidationError

class SocketConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SocketConnectionError'
    Object.setPrototypeOf(this, SocketConnectionError.prototype)
  }
}

export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiKeyValidationError'
    Object.setPrototypeOf(this, ApiKeyValidationError.prototype)
  }
}

export class ApiKeyValidator {
  constructor(private readonly _logger: ConsoleLogger) {}

  async validate(
    validationSocket: SocketService<Validation.Emission, Validation.Actions> | null,
    provider: string,
    apiKey: string
  ): Promise<Result<ValidationResult, ApiKeyValidationError>> {
    if (!this._isValidProvider(provider)) {
      return err(new ApiKeyValidationError(`Invalid provider: ${provider}`))
    }

    if (!validationSocket) {
      const error = new ApiKeyValidationError('Validation socket not available')
      this._logger.error('[ApiKeyValidator.validate]', error)
      return err(error)
    }

    const waitResult = await validationSocket.waitForConnection()

    if (waitResult.isErr()) {
      const error = new SocketConnectionError(waitResult.error.message)
      this._logger.error('Failed to connect:', error)
      return err(new ApiKeyValidationError(error.message))
    }

    return this._emitValidateApiKey(validationSocket, provider, apiKey)
  }

  private _isValidProvider(provider: string): provider is 'openai' | 'anthropic' | 'google' {
    return ['openai', 'anthropic', 'google'].includes(provider)
  }

  private _emitValidateApiKey(
    validationSocket: SocketService<Validation.Emission, Validation.Actions>,
    provider: 'openai' | 'anthropic' | 'google',
    apiKey: string
  ): Promise<Result<ValidationResult, ApiKeyValidationError>> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(err(new ApiKeyValidationError('Validation request timeout after 10s')))
      }, 10000)

      validationSocket.emit('validateApiKey', { provider, apiKey }, (response: unknown) => {
        clearTimeout(timeoutId)

        if (
          typeof response === 'object' &&
          response !== undefined &&
          response !== null &&
          'type' in response &&
          'provider' in response
        ) {
          resolve(ok(response as ValidationResult))
        } else {
          resolve(err(new ApiKeyValidationError('Invalid response format from server')))
        }
      })
    })
  }
}
