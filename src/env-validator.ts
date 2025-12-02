import { z } from 'zod/v4'
import { Result } from 'neverthrow'
import { BaseError } from './base-error'

const envSchema = z.object({
  VITE_NODE_ENV: z.enum(['development', 'production', 'test']),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SOCKET_URL: z.url(),
})

export type EnvConfig = z.infer<typeof envSchema>

class ValidationError extends BaseError {}

export function validateEnvConfig(): Result<EnvConfig, ValidationError> {
  return validateSchema(envSchema)
}

function validateSchema<T>(schema: z.ZodType<T>): Result<T, ValidationError> {
  return Result.fromThrowable(
    // @ts-ignore
    () => schema.parse(import.meta.env),
    (error) => new ValidationError((error as Error).message)
  )()
}
