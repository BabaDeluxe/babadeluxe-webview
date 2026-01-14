import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateEnvConfig } from '../src/env-validator'

// @ts-ignore
const env = import.meta.env

describe('validate()', () => {
  const originalEnv = { ...env }

  beforeEach(() => {
    env.VITE_NODE_ENV = 'development'
    env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    env.VITE_SUPABASE_ANON_KEY = 'key123'
    env.VITE_SOCKET_URL = 'https://socket.example.com'
  })

  afterEach(() => {
    Object.keys(env).forEach((key) => {
      delete env[key]
    })
    Object.assign(env, originalEnv)
  })

  it('returns Ok with valid env config', () => {
    const result = validateEnvConfig()

    expect(result.isOk()).toBe(true)
  })

  it('returns Err when VITE_NODE_ENV is invalid', () => {
    env.VITE_NODE_ENV = 'staging'

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error.name).toBe('EnvValidationError')
      expect(result.error.message).toContain('VITE_NODE_ENV')
    }
  })

  it('returns Err when URL is invalid', () => {
    env.VITE_SUPABASE_URL = 'not-a-url'

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('VITE_SUPABASE_URL')
    }
  })

  it('returns Err when VITE_SUPABASE_ANON_KEY is missing', () => {
    delete env.VITE_SUPABASE_ANON_KEY

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('VITE_SUPABASE_ANON_KEY')
    }
  })

  it('returns Err when multiple fields are invalid', () => {
    env.VITE_NODE_ENV = 'invalid'
    env.VITE_SUPABASE_URL = 'bad-url'
    env.VITE_SOCKET_URL = 'also-bad'

    const result = validateEnvConfig()

    expect(result.isErr()).toBe(true)
  })
})
