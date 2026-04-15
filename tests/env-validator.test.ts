import { describe, it, expect, beforeEach, afterEach, test, beforeAll } from 'vitest'
import { EnvConfigType, validateEnvConfig } from '../src/env-validator'

type Writeable<T> = {
  -readonly [P in keyof T]: T[P]
}

const env: Writeable<EnvConfigType> = import.meta.env as unknown as Writeable<EnvConfigType>

describe('validateEnvConfig()', () => {
  const originalEnv = { ...env }
  const validEnv = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_NODE_ENV: 'development',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_SUPABASE_ANON_KEY: 'key123',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    VITE_SOCKET_URL: 'https://socket.example.com',
  }

  beforeAll(() => {
    Object.assign(env, validEnv)
  })

  afterEach(() => {
    Object.assign(env, originalEnv)
  })

  it('returns Ok with valid env config', () => {
    const result = validateEnvConfig()

    expect(result.isOk()).toBe(true)
  })

  describe('validation errors', () => {
    const errorCases = [
      {
        name: 'VITE_SUPABASE_URL is invalid',
        setup: () => {
          env.VITE_SUPABASE_URL = 'not-a-url'
        },
        expectedError: 'VITE_SUPABASE_URL',
      },
      {
        name: 'VITE_SOCKET_URL is invalid',
        setup: () => {
          env.VITE_SOCKET_URL = 'also-not-a-url'
        },
        expectedError: 'VITE_SOCKET_URL',
      },
      {
        name: 'VITE_SUPABASE_ANON_KEY is missing',
        setup: () => {
          delete env.VITE_SUPABASE_ANON_KEY
        },
        expectedError: 'VITE_SUPABASE_ANON_KEY',
      },
    ]

    test.each(errorCases)('returns Err when $name', ({ setup, expectedError }) => {
      setup()

      const result = validateEnvConfig()

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toContain(expectedError)
      }
    })

    it('returns Err when multiple fields are invalid', () => {
      env.VITE_SUPABASE_URL = 'bad-url'
      env.VITE_SOCKET_URL = 'also-bad'

      const result = validateEnvConfig()

      expect(result.isErr()).toBe(true)
    })
  })
})
