import { SupabaseTestClient } from './client'
import type { TestUser } from './types'

let sharedAdminClient: SupabaseTestClient | undefined

function getSharedAdminClient(): SupabaseTestClient {
  sharedAdminClient ||= SupabaseTestClient.createAdminClient('shared-admin')
  return sharedAdminClient
}

export async function generatePasswordResetLinkSdk(
  email: string,
  redirectUrl: string
): Promise<string> {
  const { data, error } = await getSharedAdminClient().auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: redirectUrl },
  })

  if (error) {
    throw error
  }

  if (!data?.properties?.action_link) {
    throw new Error('Invalid response format from generatePasswordResetLink')
  }

  return data.properties.action_link
}

export async function createTestUserSdk(prefix = 'test'): Promise<TestUser> {
  const email = `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`
  const password = 'P@ssw0rd-Strong-123'

  const { data, error } = await getSharedAdminClient().auth.admin.createUser({
    email,
    password,

    email_confirm: true,
  })

  if (error || !data.user) {
    throw error ?? new Error('SDK createUser returned no user')
  }

  return { id: data.user.id, email, password }
}

export async function deleteTestUserSdk(userId: string): Promise<void> {
  const { error } = await getSharedAdminClient().auth.admin.deleteUser(userId)
  if (error) {
    throw error
  }
}
