import { err, ok, type Result } from 'neverthrow'
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

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await operation()

    if (result.isOk()) return ok(result.value)
    if (!(result.error instanceof RateLimitError)) return err(result.error)

    const isLastAttempt = attempt === maxRetries - 1
    if (isLastAttempt) return err(result.error)

    const exponentialDelayMilliseconds =
      initialDelayMilliseconds * Math.pow(backoffMultiplier, attempt)
    const jitterMilliseconds = Math.random() * 0.3 * exponentialDelayMilliseconds
    const delayMilliseconds = Math.min(
      exponentialDelayMilliseconds + jitterMilliseconds,
      maxDelayMilliseconds
    )

    logger?.warn(
      `Rate limit hit for ${context}. Retrying in ${Math.round(delayMilliseconds)}ms (attempt ${attempt + 1}/${maxRetries})`
    )

    await new Promise((resolve) => setTimeout(resolve, delayMilliseconds))
  }

  return err(new RateLimitError('Max retries exceeded'))
}
