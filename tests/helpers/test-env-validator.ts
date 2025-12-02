import process from 'node:process'
import { z } from 'zod/v4'
import { Result } from 'neverthrow'
import { BaseError } from '@/base-error'

const testEnvSchema = z.object({
  NODE_ENV: z.enum(['test']),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_PROJECT_REF: z.string().min(1),
  TEST_USER_EMAIL: z.email(),
  TEST_USER_PASSWORD: z.string().min(8),
})

export type TestEnvConfig = z.infer<typeof testEnvSchema>

class ValidationError extends BaseError {}

function validateSchema<T>(schema: z.ZodType<T>): Result<T, ValidationError> {
  return Result.fromThrowable(
    () => schema.parse(process.env),
    (error) => new ValidationError((error as Error).message)
  )()
}

export function validateTest(): Result<TestEnvConfig, ValidationError> {
  return validateSchema(testEnvSchema)
}
