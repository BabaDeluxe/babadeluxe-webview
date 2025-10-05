/* eslint-disable @typescript-eslint/naming-convention */
import * as yup from 'yup'
import { Result } from 'neverthrow'

const envSchema = yup
  .object({
    VITE_NODE_ENV: yup
      .mixed<'development' | 'production' | 'test'>()
      .oneOf(['development', 'production', 'test'] as const)
      .required(),
    VITE_SUPABASE_URL: yup.string().url().required(),
    VITE_SUPABASE_ANON_KEY: yup.string().required(),
  })
  .required()

export type EnvConfig = yup.InferType<typeof envSchema>

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function validate(): Result<EnvConfig, ValidationError> {
  return validateSchema(envSchema)
}

function validateSchema<T>(schema: {
  validateSync: (env: unknown) => T
}): Result<T, ValidationError> {
  return Result.fromThrowable(
    // @ts-ignore
    () => schema.validateSync(import.meta.env),
    (error) => new ValidationError((error as Error).message)
  )()
}
