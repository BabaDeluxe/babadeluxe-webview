import type { Result } from 'neverthrow'
import type { AuthError, NetworkError } from '@/errors'

export type AuthSession = {
  userId: string
  email: string
  expiresAt: number
}

export interface AuthProvider {
  signInWithOAuth(provider: 'github' | 'google'): Promise<Result<void, AuthError | NetworkError>>
  signInWithPasskey(email: string): Promise<Result<void, AuthError>>
  signInWithSSO(domain: string): Promise<Result<void, AuthError>>
  signOut(): Promise<Result<void, AuthError>>
  getAccessToken(): Promise<string | null>
  onSessionChange(cb: (session: AuthSession | null) => void): () => void
}
