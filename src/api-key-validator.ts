import { err, ok, type Result, ResultAsync } from 'neverthrow'
import { BaseError } from '@babadeluxe/shared'
import type { AbstractLogger } from '@/logger'
import type { SocketManager } from '@/socket-manager'
import { type ApiKeyValidationError, NetworkError, ValidationError, RateLimitError } from '@/errors'
import { socketTimeoutMs } from '@/constants'

const supportedProviders = ['openai', 'anthropic', 'google'] as const
type SupportedProvider = (typeof supportedProviders)[number]

const defaultSuccessStatusCode = 200

export type ValidationSuccess = {
  readonly provider: string
  readonly statusCode: number
}

type ValidationSuccessResponse = {
  readonly success: true
  readonly statusCode?: number
}

type ValidationErrorResponse = {
  readonly reason?: 'invalid_key' | 'bad_request' | 'rate_limited'
  readonly error?: 'network_error' | 'server_error' | string
  readonly provider?: string
  readonly statusCode?: number
}

export interface IApiKeyValidator {
  validate(provider: string, apiKey: string): Promise<Result<ValidationSuccess, ApiKeyValidationError>>
}

function mapResponseToError(response: unknown): BaseError {
  const isInvalidResponse = !response || typeof response !== 'object'
  if (isInvalidResponse) {
    return new ValidationError('Response was not an object')
  }
  const validationResponse = response as ValidationErrorResponse

  switch (validationResponse.reason) {
    case 'invalid_key':
      return new ValidationError(`Invalid API key for ${validationResponse.provider}`)
    case 'bad_request':
      return new NetworkError(`Bad request for ${validationResponse.provider}`)
    case 'rate_limited':
      return new RateLimitError(`Rate limited by ${validationResponse.provider}`)
    default:
      break
  }

  switch (validationResponse.error) {
    case 'network_error':
      return new NetworkError(`Network error for ${validationResponse.provider}`)
    case 'server_error':
      return new NetworkError(
        `Server error for ${validationResponse.provider} (${validationResponse.statusCode})`
      )
    default:
      return new ValidationError(
        typeof validationResponse.error === 'string'
          ? validationResponse.error
          : 'Unknown validation failure'
      )
  }
}

export class ApiKeyValidator implements IApiKeyValidator {
  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _validationSocket: SocketManager['validationSocket']
  ) {}

  async validate(
    provider: string,
    apiKey: string
  ): Promise<Result<ValidationSuccess, ApiKeyValidationError>> {
    if (!this._isValidProvider(provider)) {
      return err(new ValidationError(`Invalid provider: ${provider}`))
    }

    const waitResult = await this._validationSocket.waitForConnection()

    if (waitResult.isErr()) {
      this._logger.error('Failed to connect to validation socket', {
        provider,
        error: waitResult.error,
      })
      return err(waitResult.error)
    }

    return this._emitValidateApiKey(provider, apiKey)
  }

  private _isValidProvider(provider: string): provider is SupportedProvider {
    return supportedProviders.includes(provider as SupportedProvider)
  }

  private _isValidationSuccessResponse(response: unknown): response is ValidationSuccessResponse {
    return (
      response != null &&
      typeof response === 'object' &&
      'success' in response &&
      response.success === true
    )
  }

  private async _emitValidateApiKey(
    provider: SupportedProvider,
    apiKey: string
  ): Promise<Result<ValidationSuccess, ApiKeyValidationError>> {
    const timeoutMs = socketTimeoutMs.validation

    return await ResultAsync.fromPromise(
      new Promise<ValidationSuccess>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new NetworkError(`Validation request timeout after ${timeoutMs}ms`))
        }, timeoutMs)

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
        return new ValidationError('An unexpected error occurred during validation', error)
      }
    )
  }
}

export class LocalApiKeyValidator implements IApiKeyValidator {
  async validate(provider: string, apiKey: string): Promise<Result<ValidationSuccess, ApiKeyValidationError>> {
    // Basic local validation (regex check)
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      return err(new ValidationError(`API key for ${provider} cannot be empty`))
    }

    if (provider === 'openai' && !trimmedKey.startsWith('sk-')) {
      return err(new ValidationError('Invalid OpenAI API key format (should start with sk-)'))
    }

    if (provider === 'anthropic' && !trimmedKey.startsWith('sk-ant-')) {
      return err(new ValidationError('Invalid Anthropic API key format (should start with sk-ant-)'))
    }

    return ok({
      provider,
      statusCode: defaultSuccessStatusCode,
    })
  }
}
