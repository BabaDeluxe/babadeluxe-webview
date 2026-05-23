# Environment Variables

All environment variables are validated at boot time via Zod in `src/env-validator.ts`. The app returns a `Result<EnvConfig, Error>` (neverthrow) — it **refuses to start** if any required variable is missing or malformed.

## Variables

| Variable                  | Required                           | Description                                                      |
| :------------------------ | :--------------------------------- | :--------------------------------------------------------------- |
| `VITE_NODE_ENV`           | ✅ (default: `development`)        | `development` \| `production` \| `test`                          |
| `VITE_OFFLINE_MODE`       | ❌ optional                        | `true` \| `false` — skips Supabase/socket validation when `true` |
| `VITE_SUPABASE_URL`       | ✅ unless `VITE_OFFLINE_MODE=true` | Your Supabase project URL (`https://*.supabase.co`)              |
| `VITE_SUPABASE_ANON_KEY`  | ✅ unless `VITE_OFFLINE_MODE=true` | Supabase anonymous key (public, safe to expose)                  |
| `VITE_SOCKET_URL`         | ❌ optional                        | Socket.io backend base URL (`http://localhost:3000` in dev)      |
| `VITE_GA_MEASUREMENT_ID`  | ❌ optional                        | Google Analytics 4 measurement ID (`G-XXXXXXXXXX`)               |
| `VITE_STATSIG_CLIENT_KEY` | ❌ optional                        | Statsig client SDK key for feature flags                         |

> **Offline mode:** when `VITE_OFFLINE_MODE=true`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not required and the app runs fully without network auth.

## Env Files

| File              | When loaded              | Committed               |
| :---------------- | :----------------------- | :---------------------- |
| `.env`            | Always                   | ✅ (safe defaults only) |
| `.env.local`      | Always, overrides `.env` | ❌ (gitignored)         |
| `.env.staging`    | `vite --mode staging`    | ✅                      |
| `.env.production` | `vite build`             | ✅                      |

For local development, copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

## Boot Validation

`env-validator.ts` defines a Zod schema and returns a `Result<EnvConfigType, Error>` via neverthrow. It runs before the Vue app is mounted:

```ts
// Returns ok(config) or err(Error) — never throws
export function validateEnvConfig(
  env: Record<string, unknown> = import.meta.env
): Result<EnvConfigType, Error> {
  const result = envConfigSchema.safeParse(env)

  if (!result.success) {
    // Build a human-readable message from the structured issue list
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    return err(new Error(message))
  }

  return ok(result.data)
}
```

The schema uses `superRefine` to enforce conditional requirements:

```ts
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
```

All consumer code imports `EnvConfigType` via the `ENV_CONFIG_KEY` injection key — never `import.meta.env` directly.

## Vite Modes

```powershell
pnpm dev                     # mode: development → .env + .env.local
pnpm build                   # mode: production  → .env + .env.production
pnpm build --mode staging    # mode: staging     → .env + .env.staging
```
