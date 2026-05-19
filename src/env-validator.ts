import { err, ok, type Result } from 'neverthrow'
import { z } from 'zod'

const offlineModeSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

const envConfigSchema = z
  .object({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_SUPABASE_URL: z.string().url().optional(),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_SOCKET_URL: z.string().url().optional(),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_OFFLINE_MODE: offlineModeSchema,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_GA_MEASUREMENT_ID: z.string().min(1).optional(),
    // eslint-disable-next-line @typescript-eslint/naming-convention
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

// F9: env is injected rather than read from import.meta.env directly.
// This keeps both functions pure and removes the need for import.meta.env
// mutation in tests. Production callers pass no argument; the default
// preserves the existing zero-argument call signature.
export function isOfflineMode(env: Record<string, unknown> = import.meta.env): boolean {
  const result = offlineModeSchema.safeParse(env.VITE_OFFLINE_MODE)
  if (!result.success) {
    return false
  }

  return result.data
}

export function validateEnvConfig(
  env: Record<string, unknown> = import.meta.env
): Result<EnvConfigType, Error> {
  const result = envConfigSchema.safeParse(env)

  if (!result.success) {
    // F10: Zod v4 .message is a JSON string of the issue array. Build a
    // human-readable message from the structured issue list instead.
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    return err(new Error(message))
  }

  return ok(result.data)
}
