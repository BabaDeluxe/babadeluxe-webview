import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseAuthProvider } from './supabase-auth-provider'
import type { AuthProvider } from './auth-provider'

export function createAuthProvider(supabase: SupabaseClient): AuthProvider {
  return new SupabaseAuthProvider(supabase)
}
