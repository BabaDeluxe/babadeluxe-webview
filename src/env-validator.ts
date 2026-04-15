import { err, ok, type Result } from 'neverthrow'
import { z } from 'zod'

const offlineModeSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

const envConfigSchema = z
  .object({
    VITE_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    VITE_SUPABASE_URL: z.string().url().optional(),
    VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    VITE_SOCKET_URL: z.string().url().optional(),
    VITE_OFFLINE_MODE: offlineModeSchema,
    VITE_GA_MEASUREMENT_ID: z.string().min(1).optional(),
    VITE_STATSIG_CLIENT_KEY: z.string().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.VITE_OFFLINE_MODE) {
      return
    }

    if (!config.VITE_SUPABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VITE_SUPABASE_URL'],
        message: 'VITE_SUPABASE_URL is required when offline mode is disabled',
      })
    }

    if (!config.VITE_SUPABASE_ANON_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VITE_SUPABASE_ANON_KEY'],
        message: 'VITE_SUPABASE_ANON_KEY is required when offline mode is disabled',
      })
    }
  })

export type EnvConfigType = Readonly<z.infer<typeof envConfigSchema>>

export function isOfflineMode(): boolean {
  const result = offlineModeSchema.safeParse(import.meta.env.VITE_OFFLINE_MODE)
  if (!result.success) {
    return false
  }

  return result.data
}

export function validateEnvConfig(): Result<EnvConfigType, Error> {
  const result = envConfigSchema.safeParse(import.meta.env)

  if (!result.success) {
    return err(new Error(result.error.message))
  }

  return ok(result.data)
}
