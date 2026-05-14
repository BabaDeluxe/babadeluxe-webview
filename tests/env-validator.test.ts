import { describe, it, expect, afterEach, test, beforeAll } from 'vitest'
import { type EnvConfigType, validateEnvConfig } from '../src/env-validator'

type Writeable<T> = {
  -readonly [P in keyof T]: T[P]
}

const env: Writeable<EnvConfigType> = import.meta.env as unknown as Writeable<EnvConfigType>

describe('validateEnvConfig()', () => {
  const originalEnv = { ...env }
  const validEnv = {
    VITE_NODE_ENV: 'development',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'key123',
    VITE_SOCKET_URL: 'https://socket.example.com',
    VITE_OFFLINE_MODE: 'false',
  }

  beforeAll(() => {
    Object.assign(env, validEnv)
  })

  afterEach(() => {
    for (const key in env) {
        delete (env as any)[key]
    }
    Object.assign(env, originalEnv)
  })

  it('returns Ok with valid env config', () => {
    const result = validateEnvConfig()
    expect(result.isOk()).toBe(true)
  })

  describe('validation errors', () => {
    test('returns Err when VITE_SUPABASE_URL is invalid', () => {
      (env as any).VITE_SUPABASE_URL = 'not-a-url'
      const result = validateEnvConfig()
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('VITE_SUPABASE_URL')
      }
    })

    test('returns Err when VITE_SOCKET_URL is invalid', () => {
      (env as any).VITE_SOCKET_URL = 'also-not-a-url'
      const result = validateEnvConfig()
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('VITE_SOCKET_URL')
      }
    })

    test('returns Err when VITE_SUPABASE_ANON_KEY is missing and offline mode is false', () => {
      (env as any).VITE_OFFLINE_MODE = 'false';
      delete (env as any).VITE_SUPABASE_ANON_KEY;
      const result = validateEnvConfig()
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('VITE_SUPABASE_ANON_KEY')
      }
    })

    it('returns Err when multiple fields are invalid', () => {
      (env as any).VITE_SUPABASE_URL = 'bad-url';
      (env as any).VITE_SOCKET_URL = 'also-bad';
      const result = validateEnvConfig()
      expect(result.isErr()).toBe(true)
    })
  })
})
