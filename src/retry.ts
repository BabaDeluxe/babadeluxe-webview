import { err, type Result } from 'neverthrow'
import { RateLimitError } from '@/errors'

type RetryConfig = {
  maxRetries: number
  initialDelayMilliseconds: number
  backoffMultiplier: number
  maxDelayMilliseconds: number
  logger?: { warn: (message: string) => void }
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 5,
  initialDelayMilliseconds: 1000,
  backoffMultiplier: 2,
  maxDelayMilliseconds: 16_000,
}

export async function retryWithBackoff<T, E>(
  operation: () => Promise<Result<T, E | RateLimitError>>,
  context: string,
  config: Partial<RetryConfig> = {}
): Promise<Result<T, E | RateLimitError>> {
  const { maxRetries, initialDelayMilliseconds, backoffMultiplier, maxDelayMilliseconds, logger } =
    { ...defaultRetryConfig, ...config }

  const isInvalidRetryConfig = maxRetries <= 0
  if (isInvalidRetryConfig) {
    return err(new RateLimitError(`retryWithBackoff called with maxRetries <= 0 for "${context}"`))
  }

  let lastError: E | RateLimitError | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await operation()

    if (result.isOk()) return result

    lastError = result.error
    const isRateLimitError = lastError instanceof RateLimitError
    if (!isRateLimitError) {
      return err(lastError)
    }

    const isLastAttempt = attempt === maxRetries - 1
    if (isLastAttempt) break

    const exponentialDelay = initialDelayMilliseconds * Math.pow(backoffMultiplier, attempt)
    const jitter = Math.random() * 0.3 * exponentialDelay
    const delay = Math.min(exponentialDelay + jitter, maxDelayMilliseconds)

    logger?.warn(
      `Rate limit hit for ${context}. Retrying in ${Math.round(
        delay
      )}ms (attempt ${attempt + 1}/${maxRetries})`
    )

    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  return err(lastError ?? new RateLimitError('Max retries exceeded'))
}
