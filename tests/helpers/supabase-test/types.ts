/* eslint-disable @typescript-eslint/naming-convention */
export type TestUser = {
  readonly id: string
  readonly email: string
  readonly password: string
}

export type TestVariant = {
  name: string
  createUser: (prefix: string) => Promise<TestUser>
  deleteUser: (userId: string) => Promise<void>
}

export type AdminUser = {
  readonly id: string
  readonly aud: string
  readonly role: string
  readonly email: string
  readonly email_confirmed_at?: string
  readonly phone?: string
  readonly last_sign_at?: string
  readonly app_metadata: Record<string, unknown>
  readonly user_metadata: Record<string, unknown>
  readonly identities?: readonly unknown[]
  readonly created_at: string
  readonly updated_at: string
}

export type ErrorResponse = {
  readonly error: string
  readonly error_description?: string
  readonly message?: string
}

export type RecoveryLinkResponse = {
  readonly action_link: string
  readonly email_otp: string
  readonly hashed_token: string
  readonly redirect_to: string
  readonly verification_type: string
}
