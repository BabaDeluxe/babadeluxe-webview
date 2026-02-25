import type { Page } from '@playwright/test'
import type { TestUser } from '../../helpers/supabase-test/types'

export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await page.fill('input[aria-label="Email Address"]', user.email)
  await page.fill('input[aria-label="Password"]', user.password)
  await page.click('button:has-text("Sign In")')

  await page.getByTestId('chat-view-container').waitFor({ state: 'visible', timeout: 15000 })
}
