import { isOfflineMode } from '@/env-validator'

export type AuthMode = 'supabase-only' | 'zitadel'

export function resolveAuthMode(): AuthMode {
  if (isOfflineMode()) return 'supabase-only'
  if (import.meta.env.VITE_ZITADEL_ISSUER) return 'zitadel'
  return 'supabase-only'
}

export const authConfig = {
  zitadelIssuer: import.meta.env.VITE_ZITADEL_ISSUER as string | undefined,
  zitadelClientId: import.meta.env.VITE_ZITADEL_CLIENT_ID as string | undefined,
  ssoEnabled: !!import.meta.env.VITE_ZITADEL_ISSUER,
  passkeyEnabled: !!import.meta.env.VITE_ZITADEL_ISSUER,
}
