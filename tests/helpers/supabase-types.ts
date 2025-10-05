/* eslint-disable @typescript-eslint/naming-convention */
export type SupabaseAdminUser = {
  id: string
  aud: string
  role: string
  email: string
  email_confirmed_at?: string
  phone?: string
  confirmed_at?: string
  last_sign_in_at?: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
  identities?: unknown[]
  created_at: string
  updated_at: string
}
export type SupabaseErrorResponse = {
  error: string
  error_description?: string
  message?: string
}
