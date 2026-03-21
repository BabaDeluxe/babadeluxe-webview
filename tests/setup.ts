import { beforeAll, vi } from 'vitest'
import { validateEnvConfig } from '../src/env-validator'
import { validateTest } from './helpers/test-env-validator'
import { NetworkError } from '@/errors'
import { err } from 'neverthrow'
import { emitWithTimeout } from '@/emit-with-timeout'

// TODO Restructure tests folder

// Validate env before running tests
beforeAll(() => {
  const envValidationResult = validateEnvConfig()
  if (envValidationResult.isErr()) {
    throw new Error(`Test env validation failed: ${envValidationResult.error.message}`)
  }

  const testEnvValidationResult = validateTest()
  if (testEnvValidationResult.isErr()) {
    throw new Error(`Test env validation failed: ${testEnvValidationResult.error.message}`)
  }

  vi.mock('@/emit-with-timeout', () => ({
    emitWithTimeout: vi.fn(),
  }))

  // For successful response
  // vi.mocked(emitWithTimeout).mockResolvedValueOnce(ok(data))

  // For error response
  vi.mocked(emitWithTimeout).mockResolvedValueOnce(err(new NetworkError('error')))
})
