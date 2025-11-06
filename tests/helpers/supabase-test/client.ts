import process from 'node:process'
import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type Subscription,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { createStorageAdapter, noopStorage } from './storage-adapter'
import { storage } from '../storage'

const url = process.env.VITE_SUPABASE_URL!
const apiKey = process.env.VITE_SUPABASE_ANON_KEY!
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

export class SupabaseTestClient {
  static createUserClient(storageKey = 'test-user-client'): SupabaseTestClient {
    const client = createClient(url, apiKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        storage: createStorageAdapter(storageKey),
        storageKey,
      },
    })
    return new SupabaseTestClient(client, storageKey)
  }

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

  private readonly _subscriptions: Subscription[]

  private constructor(
    private readonly _client: SupabaseClient,
    private readonly _storageKey: string
  ) {
    this._subscriptions = []
  }

  get auth() {
    return this._client.auth
  }

  get raw() {
    return this._client
  }

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void | Promise<void>
  ): () => void {
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

  async dispose(): Promise<void> {
    for (const subscription of this._subscriptions) {
      subscription.unsubscribe()
    }

    this._subscriptions.length = 0

    await this._client.auth.signOut()
    await this._client.removeAllChannels()

    storage.addOrUpdate(this._storageKey, undefined)
  }
}
