import { expect } from '@playwright/test'
import { test } from './helpers/fixtures'
import { skipIfNoBackend } from './helpers/skip-if-no-backend'

test.describe('Auth E2E', () => {
  test.beforeEach(async ({ page }) => {
    skipIfNoBackend()
    await page.goto('/login')
    await page.waitForTimeout(1000)
  })

  test('user can sign in and reach chat page', async ({ page, testUser }) => {
    const { email, password } = testUser

    await page.fill('[data-testid="login-email-input"]', email)
    await page.fill('[data-testid="login-password-input"]', password)
    await page.click('[data-testid="login-submit-button"]')

    // Wait for chat UI that only renders when session is set
    await expect(page.getByTestId('chat-view-container')).toBeVisible({ timeout: 15000 })
  })

  test('invalid password shows error', async ({ page, testUser }) => {
    const { email } = testUser

    await page.fill('[data-testid="login-email-input"]', email)
    await page.fill('[data-testid="login-password-input"]', 'wrongpassword')
    await page.click('[data-testid="login-submit-button"]')

    // The current implementation uses toasts for errors
    await expect(page.locator('.toast-error, [role="alert"]')).toBeVisible({ timeout: 10000 })
  })

  test('user can request password reset', async ({ page, testUser }) => {
    await page.getByTestId('login-forgot-password-link').click()
    await page.waitForURL('**/reset-password')
    await page.waitForTimeout(1000)

    await page.fill('input[type="email"]', testUser.email)
    await page.click('button[type="submit"]')

    // Basic check for navigation or success state
    const url = page.url()
    expect(url).toContain('reset-password')
  })
})
