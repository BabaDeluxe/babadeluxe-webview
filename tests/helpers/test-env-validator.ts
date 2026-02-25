/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import { z, type ZodError } from 'zod/v4'
import { Result } from 'neverthrow'
import { ValidationError } from '@/errors'

const testEnvSchema = z.object({
  NODE_ENV: z.enum(['test']),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_PROJECT_REF: z.string().min(1),
  TEST_USER_EMAIL: z.email(),
  TEST_USER_PASSWORD: z.string().min(8),
  OPENAI_API_KEY: z.string(),
})

export type TestEnvConfig = z.infer<typeof testEnvSchema>

function validateSchema<T>(schema: z.ZodType<T>): Result<T, ValidationError> {
  return Result.fromThrowable(
    () => schema.parse(process.env),
    (error) => {
      // E.g. { name: ['String must contain at least 2 character(s)'], age: ['Number must be greater than or equal to 18'] }
      const flatError = z.flattenError(error as ZodError)
      const result = new ValidationError(JSON.stringify(flatError.fieldErrors))
      return result
    }
  )()
}

export function validateTest(): Result<TestEnvConfig, ValidationError> {
  return validateSchema(testEnvSchema)
}
