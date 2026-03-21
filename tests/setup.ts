import { beforeAll, vi } from 'vitest'
import { validateEnvConfig } from '../src/env-validator'
import { validateTest } from './helpers/test-env-validator'

// Global test setup and environment validation
beforeAll(() => {
  const envValidationResult = validateEnvConfig()
  if (envValidationResult.isErr()) {
    throw new Error(`Application env validation failed: ${envValidationResult.error.message}`)
  }

  const testEnvValidationResult = validateTest()
  if (testEnvValidationResult.isErr()) {
    throw new Error(`Test env validation failed: ${testEnvValidationResult.error.message}`)
  }
})
