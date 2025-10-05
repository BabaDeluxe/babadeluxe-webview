/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import {
  createClient,
  type Subscription,
  type SupabaseClient,
  type SupportedStorage,
} from '@supabase/supabase-js'
import { storage } from '@/storage'

const url = process.env.VITE_SUPABASE_URL!
const apiKey = process.env.VITE_SUPABASE_ANON_KEY!
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

// -- Storage --
const noopStorage = {
  getItem: () => null,
  setItem() {
    /* Empty */
  },
  removeItem() {
    /* Empty */
  },
}

// Adapter to use our functional storage with Supbase client
function createStorageAdapter(storageKey: string) {
  const myStorageKey = (key: string): string => storageKey + '-----' + key

  const result = {
    getItem(key: string) {
      const value = storage.get<string>(myStorageKey(key))
      return value
    },
    setItem(key: string, value: string) {
      storage.addOrUpdate(myStorageKey(key), value)
    },
    removeItem(key: string) {
      storage.addOrUpdate(myStorageKey(key), null)
    },
  }

  return result
}

// -- Types --
export type TestUser = {
  id: string
  email: string
  password: string
}

export class SupabaseTestClient {
  private readonly _subscriptions: Subscription[]
  private constructor(
    private readonly _client: SupabaseClient,
    private readonly _storageKey: string
  ) {
    this._subscriptions = []
  }

  // -- Factory Methods --
  // eslint-disable-next-line @typescript-eslint/member-ordering
  static createUserClient(storageKey = 'test-user-client'): SupabaseTestClient {
    const client = createClient(url, apiKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        storage: createStorageAdapter(storageKey) as SupportedStorage | undefined,
        storageKey,
      },
    })
    return new SupabaseTestClient(client, storageKey)
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  static createAdminClient(storageKey = 'test-admin-client'): SupabaseTestClient {
    const client = createClient(url, serviceRole, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: noopStorage,
        storageKey,
      },
    })

    return new SupabaseTestClient(client, storageKey)
  }

  // -- Client Access --
  get auth() {
    return this._client.auth
  }

  get raw() {
    return this._client
  }

  // -- Subscription Management --
  onAuthStateChange(callback: (event: string, session: any) => void): () => void {
    const {
      data: { subscription },
    } = this._client.auth.onAuthStateChange(callback)
    this._subscriptions.push(subscription)

    return () => {
      const index = this._subscriptions.indexOf(subscription)
      if (index !== -1) {
        this._subscriptions.splice(index, 1)
        subscription.unsubscribe()
      }
    }
  }

  // -- Lifecycle Management --
  async dispose(): Promise<void> {
    // Unsubscribe all listeners
    for (const subscription of this._subscriptions) subscription.unsubscribe()

    this._subscriptions.length = 0

    // Sign out
    await this._client.auth.signOut()
    await this._client.removeAllChannels()

    // Clear storage
    storage.addOrUpdate(this._storageKey, null)
  }
}

// -- Shared Admin Client for SDK Variant --
// Loadzy-load and reused for all SDK admin operations
let sharedAdminClient: SupabaseTestClient | undefined
function getSharedAdminClient(): SupabaseTestClient {
  sharedAdminClient ||= SupabaseTestClient.createAdminClient('shared-admin')
  return sharedAdminClient
}

// -- Admin API Helpers --
type AdminUser = {
  id: string
  aud: string
  role: string
  email: string
  email_confirmed_at?: string
  phone?: string
  last_sign_at?: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
  identities?: unknown[]
  created_at: string
  updated_at: string
}

type ErrorResponse = {
  error: string
  error_description?: string
  message?: string
}

type RecoveryLinkResponse = {
  action_link: string
  email_otp: string
  hashed_token: string
  redirect_to: string
  verification_type: string
}

// -- Type Guards --
function isErrorResponse(data: unknown): data is ErrorResponse {
  return typeof data === 'object' && data !== null && ('error' in data || 'message' in data)
}

function isAdminUser(data: unknown): data is AdminUser {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as { id: unknown }).id === 'string'
  )
}

function isRecoveryLinkResponse(data: unknown): data is RecoveryLinkResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'action_link' in data &&
    typeof (data as { action_link: unknown }).action_link === 'string'
  )
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

// -- Admin API Interal Helper
async function makeAdminRequest(
  endpoint: string,
  options: { method: 'POST' | 'DELETE'; body?: Record<string, unknown> }
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

// -- Public Admin Functions --
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

export async function deleteTestUserRaw(userId: string): Promise<void> {
  await makeAdminRequest(`users/${userId}`, { method: 'DELETE' })
}

export async function deleteTestUserSdk(userId: string): Promise<void> {
  const { error } = await getSharedAdminClient().auth.admin.deleteUser(userId)
  if (error) throw error
}
