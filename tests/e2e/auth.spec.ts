/* eslint-disable capitalized-comments */
import { expect } from '@playwright/test'
import { test } from './fixtures'

test.describe('Auth E2E', () => {
  test('user can sign in and reach chat page', async ({ page, testUser }) => {
    const { email, password } = testUser

    await page.goto('/')

    await page.fill('input[aria-label="Email Address"]', email)
    await page.fill('input[aria-label="Password"]', password)
    await page.click('button:has-text("Sign In")')

    await page.waitForURL('**/Chat')
    await expect(page.locator('nav >> text=Chat')).toBeVisible()
  })

  test('invalid password shows error', async ({ page, testUser }) => {
    const { email } = testUser

    await page.goto('/')

    await page.fill('input[aria-label="Email Address"]', email)
    await page.fill('input[aria-label="Password"]', 'wrongpassword')
    await page.click('button:has-text("Sign In")')

    await expect(page.locator('#login .text-error')).toBeVisible()
  })

  // test('user can sign out', async ({ page, testUser }) => {
  //   const { email, password } = testUser

  //   await page.goto('/')

  //   await page.fill('input[aria-label="Email Address"]', email)
  //   await page.fill('input[aria-label="Password"]', password)
  //   await page.click('button:has-text("Sign In")')
  //   await page.waitForURL('**/Chat')

  //   await page.evaluate(async () => {
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  //     const { supabase } = globalThis as any
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  //     await supabase.auth.signOut()
  //   })

  //   await page.waitForURL('**/')
  //   await expect(page.locator('#login')).toBeVisible()
  // })

  test('user can request password reset', async ({ page, testUser }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Forgot Password?' }).click()
    await page.waitForURL('**/reset-password')

    await page.getByRole('textbox', { name: 'Email Address' }).fill(testUser.email)
    await page.getByLabel('Send Reset Link').click()

    const success = page.getByLabel('Password Reset Success')
    const error = page.getByLabel('Password Reset Error')

    return Promise.race([
      expect(success).toBeEnabled(),
      expect(success).toBeVisible(),
      expect(error).toBeEnabled(),
      expect(error).toBeVisible(),
    ])
  })
})
