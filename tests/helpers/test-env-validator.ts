/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import * as yup from 'yup'
import { Result } from 'neverthrow'

const testEnvSchema = yup.object({
  NODE_ENV: yup
    .mixed<'test'>()
    .oneOf(['test'] as const)
    .required(),
  SUPABASE_SERVICE_ROLE_KEY: yup.string().required(),
  SUPABASE_PROJECT_REF: yup.string().required(),
  TEST_USER_EMAIL: yup.string().email().required(),
  TEST_USER_PASSWORD: yup.string().min(8).required(),
})

export type TestEnvConfig = yup.InferType<typeof testEnvSchema>

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function validateSchema<T>(schema: {
  validateSync: (env: NodeJS.ProcessEnv) => T
}): Result<T, ValidationError> {
  return Result.fromThrowable(
    () => schema.validateSync(process.env),
    (error) => new ValidationError((error as Error).message)
  )()
}

export function validateTest(): Result<TestEnvConfig, ValidationError> {
  return validateSchema(testEnvSchema)
}
