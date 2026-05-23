import { type Result, ResultAsync, ok, err } from 'neverthrow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthError, type NetworkError } from '@/errors'
import type { AuthProvider, AuthSession } from './auth-provider'
import { isOfflineMode } from '@/env-validator'

export class SupabaseAuthProvider implements AuthProvider {
  constructor(private readonly _supabase: SupabaseClient) {}

  async signInWithOAuth(
    provider: 'github' | 'google'
  ): Promise<Result<void, AuthError | NetworkError>> {
    if (isOfflineMode()) return ok(undefined)

    const appUrl = import.meta.env.VITE_APP_URL ?? globalThis.location.origin

    const result = await ResultAsync.fromPromise(
      this._supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${appUrl}/auth/callback`,
        },
      }),
      (e: unknown) => {
        if (e instanceof Error) {
          return new AuthError(e.message, e)
        }
        return new AuthError('OAuth failed', e)
      }
    )

    if (result.isErr()) {
      return err(result.error)
    }

    if (result.value.error) {
      return err(new AuthError(result.value.error.message))
    }

    return ok(undefined)
  }

  async signOut(): Promise<Result<void, AuthError>> {
    if (isOfflineMode()) return ok(undefined)

    const { error } = await this._supabase.auth.signOut()
    if (error) return err(new AuthError(error.message))
    return ok(undefined)
  }

  async getAccessToken(): Promise<string | null> {
    if (isOfflineMode()) return null

    const { data } = await this._supabase.auth.getSession()

    return data.session?.access_token ?? null
  }

  onSessionChange(cb: (session: AuthSession | null) => void): () => void {
    if (isOfflineMode()) return () => {}

    const {
      data: { subscription },
    } = this._supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        cb(null)
        return
      }

      cb({
        userId: session.user.id,
        email: session.user.email ?? '',
        expiresAt: session.expires_at ?? 0,
      })
    })

    return () => {
      subscription.unsubscribe()
    }
  }
}
