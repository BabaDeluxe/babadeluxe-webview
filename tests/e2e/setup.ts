import { chromium, type FullConfig } from '@playwright/test'
import { ConsoleLogger } from '@simwai/utils'
import type { Result } from 'neverthrow'
import { ResultAsync } from 'neverthrow'

type ServerReadinessError = {
  readonly type: 'navigation_failed' | 'validation_failed' | 'max_attempts_exceeded'
  readonly message: string
  readonly attempt?: number
}

type BackendHealthError = {
  readonly type: 'health_check_failed' | 'max_attempts_exceeded'
  readonly message: string
  readonly attempt?: number
}

class ServerReadinessErrorFactory {
  static navigationFailed(baseURL: string, attempt: number): ServerReadinessError {
    return {
      type: 'navigation_failed',
      message: `Failed to navigate to ${baseURL}`,
      attempt,
    }
  }

  static validationFailed(message: string, attempt: number): ServerReadinessError {
    return {
      type: 'validation_failed',
      message,
      attempt,
    }
  }

  static maxAttemptsExceeded(maxAttempts: number, attempt: number): ServerReadinessError {
    return {
      type: 'max_attempts_exceeded',
      message: `Dev server not ready after ${maxAttempts} attempts`,
      attempt,
    }
  }

  static unexpectedExit(): ServerReadinessError {
    return {
      type: 'max_attempts_exceeded',
      message: 'Unexpected exit from retry loop',
    }
  }
}

class BackendHealthErrorFactory {
  static healthCheckFailed(backendUrl: string, attempt: number): BackendHealthError {
    return {
      type: 'health_check_failed',
      message: `Backend health check failed at ${backendUrl}`,
      attempt,
    }
  }

  static maxAttemptsExceeded(
    backendUrl: string,
    maxAttempts: number,
    attempt: number
  ): BackendHealthError {
    return {
      type: 'max_attempts_exceeded',
      message:
        `Backend at ${backendUrl} not ready after ${maxAttempts} attempts. ` +
        `Start your backend server before running E2E tests.`,
      attempt,
    }
  }
}

async function checkBackendHealthOnce(
  backendUrl: string,
  attempt: number
): Promise<Result<void, BackendHealthError>> {
  return ResultAsync.fromPromise(fetch(backendUrl), () =>
    BackendHealthErrorFactory.healthCheckFailed(backendUrl, attempt)
  ).andThen((response) =>
    response.ok
      ? ResultAsync.fromSafePromise(Promise.resolve(undefined))
      : ResultAsync.fromSafePromise(
          Promise.reject(BackendHealthErrorFactory.healthCheckFailed(backendUrl, attempt))
        )
  )
}

async function checkBackendHealth(
  backendUrl: string,
  maxAttempts: number,
  delayMs: number,
  logger: ConsoleLogger
): Promise<Result<void, BackendHealthError>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await checkBackendHealthOnce(backendUrl, attempt)

    if (result.isOk()) {
      logger.log(`Backend ready after ${attempt} attempts`)
      return result
    }

    if (attempt === maxAttempts) {
      return ResultAsync.fromSafePromise<void, BackendHealthError>(
        Promise.reject(
          BackendHealthErrorFactory.maxAttemptsExceeded(backendUrl, maxAttempts, attempt)
        )
      )
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return ResultAsync.fromSafePromise<void, BackendHealthError>(
    Promise.reject(
      BackendHealthErrorFactory.maxAttemptsExceeded(backendUrl, maxAttempts, maxAttempts)
    )
  )
}

async function checkServerReady(
  baseURL: string,
  attempt: number
): Promise<Result<void, ServerReadinessError>> {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  const result = await ResultAsync.fromPromise(
    page.goto(baseURL, {
      waitUntil: 'networkidle',
      timeout: 5000,
    }),
    () => ServerReadinessErrorFactory.navigationFailed(baseURL, attempt)
  )
    .andThen(() =>
      ResultAsync.fromPromise(
        page.evaluate(() => {
          return document.readyState === 'complete' && Boolean(document.querySelector('#app'))
        }),
        () => ServerReadinessErrorFactory.validationFailed('DOM validation failed', attempt)
      )
    )
    .andThen((isReady) =>
      isReady
        ? ResultAsync.fromSafePromise(Promise.resolve(undefined))
        : ResultAsync.fromSafePromise(
            Promise.reject(
              ServerReadinessErrorFactory.validationFailed('App mount point not found', attempt)
            )
          )
    )

  await browser.close()
  return result
}

async function waitForServer(
  baseURL: string,
  maxAttempts: number,
  delayMs: number,
  logger: ConsoleLogger
): Promise<Result<void, ServerReadinessError>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await checkServerReady(baseURL, attempt)

    if (result.isOk()) {
      logger.log(`Dev server ready after ${attempt} attempts`)
      return result
    }

    if (attempt === maxAttempts) {
      return ResultAsync.fromSafePromise<void, ServerReadinessError>(
        Promise.reject(ServerReadinessErrorFactory.maxAttemptsExceeded(maxAttempts, attempt))
      )
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return ResultAsync.fromSafePromise<void, ServerReadinessError>(
    Promise.reject(ServerReadinessErrorFactory.unexpectedExit())
  )
}

async function globalSetup(config: FullConfig): Promise<void> {
  const logger = new ConsoleLogger({ isTimeEnabled: false })

  const backendUrl = 'http://localhost:3700/health'
  const devServerUrl =
    (config.projects[0]?.use as { baseURL?: string })?.baseURL ?? 'http://127.0.0.1:5100'
  const maxAttempts = 30
  const delayMs = 500

  logger.log(`⏳ Checking backend health at ${backendUrl}...`)
  const backendResult = await checkBackendHealth(backendUrl, maxAttempts, delayMs, logger)

  if (backendResult.isErr()) {
    const error = backendResult.error
    throw new Error(
      `${error.type}: ${error.message}${error.attempt ? ` (attempt ${error.attempt})` : ''}`
    )
  }

  logger.log(`⏳ Waiting for dev server at ${devServerUrl}...`)
  const serverResult = await waitForServer(devServerUrl, maxAttempts, delayMs, logger)

  if (serverResult.isErr()) {
    const error = serverResult.error
    throw new Error(
      `${error.type}: ${error.message}${error.attempt ? ` (attempt ${error.attempt})` : ''}`
    )
  }
}

export default globalSetup
