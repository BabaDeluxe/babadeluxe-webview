import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateEnvConfig } from '../src/env-validator'

describe('validate()', () => {
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    import.meta.env.VITE_NODE_ENV = 'development'
    import.meta.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'key123'
    import.meta.env.VITE_SOCKET_URL = 'https://socket.example.com'
  })

  afterEach(() => {
    Object.keys(import.meta.env).forEach((key) => {
      delete import.meta.env[key]
    })
    Object.assign(import.meta.env, originalEnv)
  })

  it('returns Ok with valid env config', () => {
    const result = validateEnvConfig()

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        VITE_NODE_ENV: 'development',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'key123',
        VITE_SOCKET_URL: 'https://socket.example.com',
      })
    }
  })

  it('returns Err when VITE_NODE_ENV is invalid', () => {
    import.meta.env.VITE_NODE_ENV = 'staging'

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error.name).toBe('ValidationError')
      expect(result.error.message).toContain('VITE_NODE_ENV')
    }
  })

  it('returns Err when URL is invalid', () => {
    import.meta.env.VITE_SUPABASE_URL = 'not-a-url'

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('VITE_SUPABASE_URL')
    }
  })

  it('returns Err when VITE_SUPABASE_ANON_KEY is missing', () => {
    delete import.meta.env.VITE_SUPABASE_ANON_KEY

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('VITE_SUPABASE_ANON_KEY')
    }
  })

  it('returns Err when multiple fields are invalid', () => {
    import.meta.env.VITE_NODE_ENV = 'invalid'
    import.meta.env.VITE_SUPABASE_URL = 'bad-url'
    import.meta.env.VITE_SOCKET_URL = 'also-bad'

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
  })
})
