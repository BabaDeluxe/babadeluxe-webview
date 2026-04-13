import path from 'node:path'
import fs from 'node:fs'
import { test as base } from '@playwright/test'
import {
  createTestUserRaw,
  createTestUserSdk,
  deleteTestUserSdk,
  deleteTestUserRaw,
  type TestUser,
} from '../../helpers/supabase-test'
import { IndexedDbManager } from './indexeddb-manager'
import { loginViaUi } from './login-via-ui'
import { gotoOptions } from './test-data'

type WorkerOptions = {
  variant: 'raw' | 'sdk'
}

type WorkerFixtures = {
  workerUser: TestUser
  workerStorageState: string
}

type TestFixtures = {
  testUser: TestUser
  db: IndexedDbManager
}

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

  db: async ({ page }, use) => {
    await use(new IndexedDbManager(page, gotoOptions))
  },
})

export const authTest = test.extend<TestFixtures, WorkerFixtures>({
  workerStorageState: [
    async ({ browser, workerUser }, use, workerInfo) => {
      const workerId = workerInfo.workerIndex
      const authDir = path.resolve(workerInfo.project.outputDir, '.auth')
      const authFile = path.join(authDir, `worker-${workerId}.json`)

      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true })
      }

      const baseUrl = workerInfo.project.use.baseURL
      const context = await browser.newContext({ baseURL: baseUrl })
      const page = await context.newPage()

      await loginViaUi(page, workerUser)
      await page.goto('/chat')
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
