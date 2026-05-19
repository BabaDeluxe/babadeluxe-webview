import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { validateEnvConfig } from '../src/env-validator'

// validEnv uses the raw pre-parse wire format — string values exactly as
// Vite would provide them. EnvConfigType is the post-transform output shape
// and must not be used to type test input objects.
const validEnv: Record<string, unknown> = {
  /* eslint-disable @typescript-eslint/naming-convention */
  VITE_NODE_ENV: 'development',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'key123',
  VITE_SOCKET_URL: 'https://socket.example.com',
  VITE_OFFLINE_MODE: 'false', // string — raw wire format consumed by the schema
  /* eslint-enable @typescript-eslint/naming-convention */
}

describe('validateEnvConfig()', () => {
  let env: Record<string, unknown>

  beforeEach(() => {
    env = { ...validEnv }
  })

  afterEach(() => {
    env = { ...validEnv }
  })

  it('returns Ok with valid env config', () => {
    const result = validateEnvConfig(env)
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().VITE_NODE_ENV).toBe('development')
  })

  describe('validation errors', () => {
    it('returns Err when VITE_SUPABASE_URL is invalid', () => {
      env.VITE_SUPABASE_URL = 'not-a-url'
      const result = validateEnvConfig(env)
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('VITE_SUPABASE_URL')
    })

    it('returns Err when VITE_SOCKET_URL is invalid', () => {
      env.VITE_SOCKET_URL = 'also-not-a-url'
      const result = validateEnvConfig(env)
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('VITE_SOCKET_URL')
    })

    it('returns Err when VITE_SUPABASE_ANON_KEY is missing and offline mode is false', () => {
      env.VITE_OFFLINE_MODE = 'false'
      delete env.VITE_SUPABASE_ANON_KEY
      const result = validateEnvConfig(env)
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('VITE_SUPABASE_ANON_KEY')
    })

    it('returns Err when VITE_SUPABASE_URL is missing and offline mode is false', () => {
      env.VITE_OFFLINE_MODE = 'false'
      delete env.VITE_SUPABASE_URL
      const result = validateEnvConfig(env)
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('VITE_SUPABASE_URL')
    })

    it('returns Err when multiple fields are invalid', () => {
      env.VITE_SUPABASE_URL = 'bad-url'
      env.VITE_SOCKET_URL = 'also-bad'
      const result = validateEnvConfig(env)
      expect(result.isErr()).toBe(true)
    })
  })

  describe('offline mode', () => {
    it('returns Ok when VITE_OFFLINE_MODE is true and Supabase keys are absent', () => {
      env.VITE_OFFLINE_MODE = 'true' // string wire format
      delete env.VITE_SUPABASE_URL
      delete env.VITE_SUPABASE_ANON_KEY
      const result = validateEnvConfig(env)
      expect(result.isOk()).toBe(true)
    })
  })
})
