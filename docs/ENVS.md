# Environment Variables

All environment variables are validated at boot time via Zod in `src/env-validator.ts`. The app **refuses to start** if any required variable is missing or malformed — no silent config drift in production.

## Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `VITE_NODE_ENV` | ✅ | `development` \| `staging` \| `production` |
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL (`https://*.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key (public, safe to expose) |
| `VITE_SOCKET_URL` | ✅ | Socket.io backend base URL (`http://localhost:3000` in dev) |

## Env Files

| File | When loaded | Committed |
| :--- | :--- | :--- |
| `.env` | Always | ✅ (safe defaults only) |
| `.env.local` | Always, overrides `.env` | ❌ (gitignored) |
| `.env.staging` | `vite --mode staging` | ✅ |
| `.env.production` | `vite build` | ✅ |

For local development, copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

## Boot Validation

`env-validator.ts` defines a Zod schema for the full env surface. It runs synchronously before the Vue app is mounted:

```ts
const envSchema = z.object({
  VITE_NODE_ENV: z.enum(['development', 'staging', 'production']),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SOCKET_URL: z.string().url(),
})

export const env = envSchema.parse(import.meta.env)
// Throws a ZodError with a clear message if any variable is invalid.
// The app never mounts in an invalid state.
```

All consumer code imports `env` from this module — never `import.meta.env` directly. This is the single source of truth for configuration.

## Vite Modes

Vite's `--mode` flag controls which `.env.*` file is loaded:

```powershell
pnpm dev                     # mode: development → .env + .env.local
pnpm build                   # mode: production  → .env + .env.production
pnpm build --mode staging    # mode: staging     → .env + .env.staging
```
