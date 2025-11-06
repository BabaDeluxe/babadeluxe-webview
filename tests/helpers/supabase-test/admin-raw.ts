import process from 'node:process'
import { isAdminUser, isErrorResponse, isRecoveryLinkResponse } from './type-guards'
import type { TestUser } from './types'

const url = process.env.VITE_SUPABASE_URL!
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function makeAdminRequest(
  endpoint: string,
  options: { readonly method: 'POST' | 'DELETE'; readonly body?: Record<string, unknown> }
): Promise<unknown> {
  const response = await fetch(`${url}/auth/v1/admin/${endpoint}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      apiKey: serviceRole,
    },
    ...(options.body && { body: JSON.stringify(options.body) }),
  })

  if (response.ok && response.status === 204) {
    return undefined
  }

  const contentType = response.headers.get('content-type')
  if (!contentType?.includes('application/json')) {
    if (!response.ok) {
      throw new Error(`Admin API ${options.method} /${endpoint} failed: ${response.status}`)
    }

    return undefined
  }

  const data: unknown = await response.json()

  if (!response.ok) {
    if (isErrorResponse(data)) {
      const errorMessage = data.error_description ?? data.message ?? data.error
      throw new Error(`Admin API ${options.method} / ${endpoint} failed ${errorMessage}`)
    }

    throw new Error(`Admin API ${options.method} /${endpoint} failed: ${response.status}`)
  }

  return data
}

export async function generatePasswordResetLinkRaw(
  email: string,
  redirectUrl: string
): Promise<string> {
  const data = await makeAdminRequest('generate_link', {
    method: 'POST',
    body: {
      type: 'recovery',
      email,

      options: { redirect_to: redirectUrl },
    },
  })

  if (!isRecoveryLinkResponse(data)) {
    throw new Error('Invalid response format from generatePasswordResetLink')
  }

  return data.action_link
}

export async function createTestUserRaw(prefix = 'test'): Promise<TestUser> {
  const email = `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`
  const password = 'P@ssw0rd-Strong-123'

  const data = await makeAdminRequest('users', {
    method: 'POST',
    body: {
      email,
      password,

      email_confirm: true,
    },
  })

  if (!isAdminUser(data)) {
    throw new Error('Invalid response format from createTestUserRaw')
  }

  return { id: data.id, email, password }
}

export async function deleteTestUserRaw(userId: string): Promise<void> {
  await makeAdminRequest(`users/${userId}`, { method: 'DELETE' })
}
