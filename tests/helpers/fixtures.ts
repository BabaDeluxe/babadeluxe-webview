import path from 'node:path'
import fs from 'node:fs'
import { test as base } from '@playwright/test'
import {
  createTestUserRaw,
  createTestUserSdk,
  deleteTestUserSdk,
  deleteTestUserRaw,
  type TestUser,
} from './supabase-test'

type WorkerOptions = {
  variant: 'raw' | 'sdk'
}

type WorkerFixtures = {
  workerUser: TestUser
  workerStorageState: string
}

type TestFixtures = {
  testUser: TestUser
}

// Base test with user creation (no auto-auth)
export const test = base.extend<TestFixtures, WorkerOptions & Pick<WorkerFixtures, 'workerUser'>>({
  variant: ['raw', { option: true, scope: 'worker' }],

  workerUser: [
    async ({ variant }, use, workerInfo) => {
      const workerId = workerInfo.workerIndex
      const createUser = variant === 'raw' ? createTestUserRaw : createTestUserSdk
      const deleteUser = variant === 'raw' ? deleteTestUserRaw : deleteTestUserSdk

      const user = await createUser(`e2e-worker-${workerId}`)
      console.log(`🔐 Worker ${workerId} (${variant}): Created user ${user.email}`)

      await use(user)

      await deleteUser(user.id)
      console.log(`🗑️ Worker ${workerId}: Deleted user ${user.id}`)
    },
    { scope: 'worker' },
  ],

  testUser: async ({ workerUser }, use) => {
    await use(workerUser)
  },
})

// Authenticated test that auto-loads storage state
export const authTest = test.extend<TestFixtures, WorkerFixtures>({
  workerStorageState: [
    async ({ browser, workerUser }, use, workerInfo) => {
      const workerId = workerInfo.workerIndex
      const authDir = path.resolve(workerInfo.project.outputDir, '.auth')
      const authFile = path.join(authDir, `worker-${workerId}.json`)

      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true })
      }

      const baseURL =
        (workerInfo.project.use as { baseURL?: string }).baseURL ?? 'http://127.0.0.1:5100'

      const context = await browser.newContext({ baseURL })
      const page = await context.newPage()

      await page.goto('/')
      await page.fill('input[aria-label="Email Address"]', workerUser.email)
      await page.fill('input[aria-label="Password"]', workerUser.password)
      await page.click('button:has-text("Sign In")')
      await page.waitForURL('**/chat', { timeout: 10000 })

      await context.storageState({ path: authFile })
      console.log(`✅ Worker ${workerId}: Auth state saved to ${authFile}`)

      await context.close()

      await use(authFile)
    },
    { scope: 'worker' },
  ],
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState)
  },
})

export type { WorkerOptions as TestOptions }
