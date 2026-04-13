import type { Page, Locator } from '@playwright/test'
import { UnclickableError, UnexpectedTestError } from '../errors'

export async function tryClick(page: Page, locator: Locator, maxTries = 3): Promise<void> {
  if (!locator) {
    throw new UnexpectedTestError('Locator passed to tryClick() is undefined')
  }

  let tryCounter = 0

  while (tryCounter < maxTries) {
    if (tryCounter >= 1) {
      await page.waitForTimeout(3000)
    }

    const count = await locator.count()
    if (count > 0) {
      await locator.first().click()
      break
    }

    tryCounter++
  }

  if (tryCounter === maxTries) {
    throw new UnclickableError('tryClick() failed: locator did not become clickable')
  }

  await page.waitForTimeout(3000)
}
