import { err, type Result, ResultAsync } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketManager } from '@/socket-manager'
import { BaseError } from '@babadeluxe/shared'
import type { ApiKeyValidationError } from '@/errors'
import {
  InvalidResponseError,
  InvalidApiKeyError,
  BadRequestError,
  LlmRateLimitedError,
  NetworkValidationError,
  ServerValidationError,
  UnsupportedProviderError,
  ValidationTimeoutError,
  SocketConnectionError,
} from '@/errors'

// TODO This shouldn't be hardcoded
const supportedProviders = ['openai', 'anthropic', 'google'] as const
type SupportedProvider = (typeof supportedProviders)[number]

const validationTimeoutMs = 10000
const defaultSuccessStatusCode = 200

type ValidationSuccess = {
  readonly provider: string
  readonly statusCode: number
}

type ValidationSuccessResponse = {
  readonly success: true
  readonly statusCode?: number
}

function mapResponseToError(response: unknown): BaseError {
  const isInvalidResponse = !response || typeof response !== 'object'
  if (isInvalidResponse) {
    return new InvalidResponseError('Response was not an object')
  }
  const res = response as { [key: string]: unknown }

  switch (res.reason) {
    case 'invalid_key':
      return new InvalidApiKeyError(`Invalid API key for ${res.provider}`)
    case 'bad_request':
      return new BadRequestError(`Bad request for ${res.provider}`)
    case 'rate_limited':
      return new LlmRateLimitedError(`Rate limited by ${res.provider}`)
    default:
      break
  }

  switch (res.error) {
    case 'network_error':
      return new NetworkValidationError(`Network error for ${res.provider}`)
    case 'server_error':
      return new ServerValidationError(`Server error for ${res.provider} (${res.statusCode})`)
    default:
      return new InvalidResponseError(
        typeof res.error === 'string' ? res.error : 'Unknown validation failure'
      )
  }
}

export class ApiKeyValidator {
  constructor(
    private readonly _logger: ConsoleLogger,
    private readonly _validationSocket: SocketManager
  ) {}

  async validate(
    provider: string,
    apiKey: string
  ): Promise<Result<ValidationSuccess, ApiKeyValidationError>> {
    if (!this._isValidProvider(provider)) {
      return err(new UnsupportedProviderError(`Invalid provider: ${provider}`))
    }

    const waitResult = await this._validationSocket.waitForConnection()

    if (waitResult.isErr()) {
      const errorMessage = `Failed to connect to socket`
      const error = new SocketConnectionError(errorMessage, waitResult.error)
      this._logger.error(errorMessage, error)
      return err(error)
    }

    return this._emitValidateApiKey(provider, apiKey)
  }

  private _isValidProvider(provider: string): provider is SupportedProvider {
    return supportedProviders.includes(provider as SupportedProvider)
  }

  private _isValidationSuccessResponse(response: unknown): response is ValidationSuccessResponse {
    return (
      response !== undefined &&
      response !== null &&
      typeof response === 'object' &&
      'success' in response &&
      response.success === true
    )
  }

  private async _emitValidateApiKey(
    provider: SupportedProvider,
    apiKey: string
  ): Promise<Result<ValidationSuccess, ApiKeyValidationError>> {
    return await ResultAsync.fromPromise(
      new Promise<ValidationSuccess>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new ValidationTimeoutError(`Validation request timeout after ${validationTimeoutMs}ms`)
          )
        }, validationTimeoutMs)

        this._validationSocket.emit(
          'validation:validateApiKey',
          { provider, apiKey },
          (response: unknown) => {
            clearTimeout(timeoutId)

            if (this._isValidationSuccessResponse(response)) {
              resolve({
                provider,
                statusCode:
                  typeof response.statusCode === 'number'
                    ? response.statusCode
                    : defaultSuccessStatusCode,
              })
            } else {
              reject(mapResponseToError(response))
            }
          }
        )
      }),
      (error) => {
        if (error instanceof BaseError) {
          return error as ApiKeyValidationError
        }
        return new InvalidResponseError(
          'An unexpected error occurred during validation',
          error as Error
        )
      }
    )
  }
}
