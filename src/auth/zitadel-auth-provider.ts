/* eslint-disable @typescript-eslint/no-unused-vars */
import { type Result, ok, err } from 'neverthrow'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthError, type NetworkError } from '@/errors'
import type { AuthProvider, AuthSession } from './auth-provider'
import { isOfflineMode } from '@/env-validator'

/**
 * ZitadelAuthProvider
 *
 * Architecture note -- Zitadel must be wired as a Supabase Third-Party Auth provider, NOT as
 * a classic OIDC exchange. This means:
 * - The Supabase client is initialized with: accessToken: async () => getZitadelToken()
 * - Zitadel issues the JWT; Supabase verifies it against Zitadel's JWKS endpoint
 * - No Supabase Auth session is created
 * - onSessionChange listens to Zitadel session events instead of supabase.auth.onAuthStateChange
 *
 * TODO: implement full Zitadel session flow
 */
export class ZitadelAuthProvider implements AuthProvider {
  constructor(
    private readonly _supabase: SupabaseClient,
    private readonly _issuer: string,
    private readonly _clientId: string
  ) {}

  async signInWithOAuth(
    _provider: 'github' | 'google'
  ): Promise<Result<void, AuthError | NetworkError>> {
    if (isOfflineMode()) return ok(undefined)
    return err(new AuthError('Zitadel OAuth not implemented yet'))
  }

  async signInWithPasskey(_email: string): Promise<Result<void, AuthError>> {
    return err(new AuthError('Zitadel Passkey not implemented yet'))
  }

  async signInWithSSO(_domain: string): Promise<Result<void, AuthError>> {
    return err(new AuthError('Zitadel SSO not implemented yet'))
  }

  async signOut(): Promise<Result<void, AuthError>> {
    if (isOfflineMode()) return ok(undefined)
    return ok(undefined)
  }

  async getAccessToken(): Promise<string | null> {
    return null
  }

  onSessionChange(_cb: (session: AuthSession | null) => void): () => void {
    return () => {}
  }
}
