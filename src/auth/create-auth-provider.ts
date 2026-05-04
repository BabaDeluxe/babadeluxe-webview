import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAuthMode, authConfig } from './auth-config'
import { SupabaseAuthProvider } from './supabase-auth-provider'
import { ZitadelAuthProvider } from './zitadel-auth-provider'
import type { AuthProvider } from './auth-provider'

export function createAuthProvider(supabase: SupabaseClient): AuthProvider {
  const mode = resolveAuthMode()
  if (mode === 'zitadel') {
    return new ZitadelAuthProvider(supabase, authConfig.zitadelIssuer!, authConfig.zitadelClientId!)
  }
  return new SupabaseAuthProvider(supabase)
}
