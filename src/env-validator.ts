/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod/v4'
import { type Result, err, ok } from 'neverthrow'
import { ValidationError } from '@/errors'

const envSchema = z.object({
  VITE_NODE_ENV: z.enum(['development', 'production', 'test']),
  VITE_SUPABASE_URL: z.url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  VITE_SOCKET_URL: z.url().optional(),
  VITE_OFFLINE_MODE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
})

export type EnvConfigType = z.infer<typeof envSchema>

export function isOfflineMode(): boolean {
  // @ts-ignore
  const env = import.meta.env
  return env.VITE_OFFLINE_MODE === 'true' || env.VITE_OFFLINE_MODE === true || env.VITE_NODE_ENV === 'development'
}

export function validateEnvConfig(): Result<void, ValidationError> {
  return validateSchema(envSchema)
}

function validateSchema<T>(schema: z.ZodType<T>): Result<void, ValidationError> {
  // @ts-ignore
  const parseResult = schema.safeParse(import.meta.env)

  if (parseResult.error) {
    const flatError = z.flattenError(parseResult.error)
    const stringifiedError = JSON.stringify(flatError.fieldErrors)
    return err(new ValidationError(stringifiedError))
  }

  return ok()
}
