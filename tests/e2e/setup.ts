import { chromium, type FullConfig } from '@playwright/test'
import { ConsoleLogger } from '@simwai/utils'
import { type Result, ResultAsync, err, ok } from 'neverthrow'

const logger = new ConsoleLogger({ isTimeEnabled: false })

type SetupError = {
  readonly type: 'backend_health' | 'server_ready'
  readonly message: string
}

async function checkBackendHealth(url: string): Promise<Result<void, SetupError>> {
  const fetchResult = await ResultAsync.fromPromise(fetch(url), () => ({
    type: 'backend_health' as const,
    message: `Failed to fetch ${url}`,
  }))

  if (fetchResult.isErr()) {
    return err(fetchResult.error)
  }

  if (!fetchResult.value.ok) {
    return err({ type: 'backend_health', message: `Backend returned ${fetchResult.value.status}` })
  }

  return ok(undefined)
}

async function checkServerReady(baseURL: string): Promise<Result<void, SetupError>> {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  const gotoResult = await ResultAsync.fromPromise(
    page.goto(baseURL, { waitUntil: 'networkidle', timeout: 5000 }),
    () => ({ type: 'server_ready' as const, message: `Failed to navigate to ${baseURL}` })
  )

  if (gotoResult.isErr()) {
    await browser.close()
    return err(gotoResult.error)
  }

  const evalResult = await ResultAsync.fromPromise(
    page.evaluate(() => {
      return document.readyState === 'complete' && Boolean(document.querySelector('#app'))
    }),
    () => ({ type: 'server_ready' as const, message: 'DOM evaluation failed' })
  )

  await browser.close()

  if (evalResult.isErr()) {
    return err(evalResult.error)
  }

  if (!evalResult.value) {
    return err({ type: 'server_ready', message: 'App mount point not found' })
  }

  return ok(undefined)
}

async function waitFor(
  checkFn: () => Promise<Result<void, SetupError>>,
  name: string,
  maxAttempts: number,
  delayMs: number
): Promise<Result<void, SetupError>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await checkFn()

    if (result.isOk()) {
      logger.log(`✅ ${name} ready after ${attempt} attempts`)
      return ok(undefined)
    }

    if (attempt === maxAttempts) {
      return err({
        type: result.error.type,
        message: `${name} not ready after ${maxAttempts} attempts. Last error: ${result.error.message}`,
      })
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return err({ type: 'server_ready', message: 'Unexpected exit from retry loop' })
}

async function globalSetup(config: FullConfig): Promise<void> {
  const backendUrl = 'http://localhost:3700/health'
  const devServerUrl =
    (config.projects[0]?.use as { baseURL?: string })?.baseURL ?? 'http://127.0.0.1:5100'
  const maxAttempts = 30
  const delayMs = 500

  logger.log(`⏳ Checking backend health at ${backendUrl}...`)
  const backendResult = await waitFor(
    () => checkBackendHealth(backendUrl),
    'Backend',
    maxAttempts,
    delayMs
  )

  if (backendResult.isErr()) {
    throw new Error(`${backendResult.error.type}: ${backendResult.error.message}`)
  }

  logger.log(`⏳ Waiting for dev server at ${devServerUrl}...`)
  const serverResult = await waitFor(
    () => checkServerReady(devServerUrl),
    'Dev server',
    maxAttempts,
    delayMs
  )

  if (serverResult.isErr()) {
    throw new Error(`${serverResult.error.type}: ${serverResult.error.message}`)
  }

  logger.log('✅ All systems ready')
}

export default globalSetup
