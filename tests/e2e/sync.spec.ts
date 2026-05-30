import { test, expect } from '@playwright/test'

test.describe('Sync Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings in offline mode (mocked by app logic usually)
    await page.goto('/settings')
  })

  test('should allow switching sync backends and show relevant fields', async ({ page }) => {
    const backendSelect = page.locator('select')
    await backendSelect.selectOption('gitlab')

    await expect(page.getByText('GitLab Token')).toBeVisible()
    await expect(page.getByText('Project ID')).toBeVisible()

    await backendSelect.selectOption('azure-devops')
    await expect(page.getByText('Organization')).toBeVisible()
    await expect(page.getByText('Repo Name')).toBeVisible()

    await backendSelect.selectOption('webdav')
    await expect(page.getByText('WebDAV URL')).toBeVisible()
  })

  test('should show test connection button and simulated feedback', async ({ page }) => {
    const backendSelect = page.locator('select')
    await backendSelect.selectOption('github')

    const testButton = page.getByRole('button', { name: /Test connection/i })
    await expect(testButton).toBeVisible()

    await testButton.click()
    await expect(page.getByText(/Connection successful/i)).toBeVisible()
  })
})
