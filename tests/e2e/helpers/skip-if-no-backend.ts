import { test } from '@playwright/test'
import process from 'node:process'

export function skipIfNoBackend() {
  const isOffline = process.env.VITE_OFFLINE_MODE === 'true'
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (isOffline || !hasServiceRoleKey) {
    test.skip(true, 'Skipping test because backend or SUPABASE_SERVICE_ROLE_KEY is not available')
  }
}
