import { test as base } from '@playwright/test'
import {
  createTestUserRaw,
  createTestUserSdk,
  deleteTestUserSdk,
  deleteTestUserRaw,
  type TestUser,
} from '../helpers/supabase-users.js'

export type TestOptions = {
  variant: 'raw' | 'sdk'
}

type TestFixtures = {
  testUser: TestUser
}

export const test = base.extend<TestOptions & TestFixtures>({
  variant: ['raw', { option: true }],
  // Define the testUser fixture
  async testUser({ variant }, use) {
    // Setup: Create user based on variant
    const createUser = variant === 'raw' ? createTestUserRaw : createTestUserSdk
    const deleteUser = variant === 'raw' ? deleteTestUserRaw : deleteTestUserSdk

    const user = await createUser(`e2e-${variant}`)
    console.log(`✅ Created ${variant} test user: ${user.email}`)

    // Provide the user to the test
    await use(user)

    // Teardown: Delete user after test
    await deleteUser(user.id)
    console.log(`🗑️ Deleted ${variant} test user: ${user.id}`)
  },
})
