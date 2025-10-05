/* eslint-disable capitalized-comments */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserRaw,
  createTestUserSdk,
  deleteTestUserRaw,
  deleteTestUserSdk,
  SupabaseTestClient,
  type TestUser,
} from './helpers/supabase-users'
import { storage } from '@/storage'

type TestVariant = {
  name: string
  createUser: (prefix: string) => Promise<TestUser>
  deleteUser: (userId: string) => Promise<void>
}

const rawVariant: TestVariant = {
  name: 'Raw (fetch bypass)',
  createUser: createTestUserRaw,
  deleteUser: deleteTestUserRaw,
}

const sdkVariant: TestVariant = {
  name: 'SDK (admin client)',
  createUser: createTestUserSdk,
  deleteUser: deleteTestUserSdk,
}

const variants: TestVariant[] = [rawVariant, sdkVariant]

for (const variant of variants) {
  void describe(`Auth integration${variant.name}`, () => {
    let userClient: SupabaseTestClient
    let userId = ''
    let email = ''
    let password = ''

    beforeAll(async () => {
      const user = await variant.createUser('test')
      userId = user.id
      email = user.email
      password = user.password

      userClient = SupabaseTestClient.createUserClient(`test-${variant.name}`)

      const { data } = await userClient.auth.getSession()
      storage.addOrUpdate('user', data.session?.user ?? undefined)

      userClient.onAuthStateChange((_event, session) => {
        storage.addOrUpdate('user', session?.user ?? undefined)
      })
    })

    afterAll(async () => {
      await userClient.dispose()
      await variant.deleteUser(userId)
    })

    it('signs in and mirrors storage', async () => {
      const { error } = await userClient.auth.signInWithPassword({ email, password })
      expect(error).toBeNull()

      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })

      const snap = storage.get<{ id: string }>('user')
      expect(snap?.id).toBe(userId)
    })

    // it('signs out and clear storage', async () => {
    //   await userClient.auth.signOut()

    //   await new Promise((resolve) => {
    //     setTimeout(resolve, 50)
    //   })

    //   expect(storage.get('user')).toBeUndefined()
    // })
  })
}
