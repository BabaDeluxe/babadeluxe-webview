/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod/v4'
import { type Result, err, ok } from 'neverthrow'
import { EnvValidationError } from '@/errors'

const envSchema = z.object({
  VITE_NODE_ENV: z.enum(['development', 'production', 'test']),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SOCKET_URL: z.url(),
})

export type EnvConfigType = z.infer<typeof envSchema>

export function validateEnvConfig(): Result<void, EnvValidationError> {
  return validateSchema(envSchema)
}

function validateSchema<T>(schema: z.ZodType<T>): Result<void, EnvValidationError> {
  // ts-ignore
  const parseResult = schema.safeParse(import.meta.env)

  if (parseResult.error) {
    const flatError = z.flattenError(parseResult.error)
    const stringifiedError = JSON.stringify(flatError.fieldErrors)
    return err(new EnvValidationError(stringifiedError))
  }

  return ok()
}
