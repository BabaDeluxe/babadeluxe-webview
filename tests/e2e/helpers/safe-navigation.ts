import type { Page } from '@playwright/test'
import type { PlaywrightOptions } from './test-data'

let navigationLock: Promise<void> | null = null

async function withNavigationLock(fn: () => Promise<void>): Promise<void> {
  if (navigationLock) await navigationLock

  let resolveLock!: () => void
  navigationLock = new Promise<void>((resolve) => {
    resolveLock = resolve
  })

  try {
    await fn()
  } finally {
    resolveLock()
    navigationLock = null
  }
}

export async function safeGoto(
  page: Page,
  url: string,
  options?: PlaywrightOptions
): Promise<void> {
  await withNavigationLock(async () => {
    await page.goto(url, options)
  })
}

export async function safeReload(page: Page, options?: PlaywrightOptions): Promise<void> {
  await withNavigationLock(async () => {
    await page.reload(options)
  })
}
