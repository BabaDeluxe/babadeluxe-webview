import { beforeAll } from 'vitest'
import { validate } from '../src/env-validator'
import { validateTest } from './helpers/test-env-validator'

beforeAll(() => {
  const envValidationResult = validate()
  if (envValidationResult.isErr()) {
    throw new Error(`Test env validation failed: ${envValidationResult.error.message}`)
  }

  const testEnvValidationResult = validateTest()
  if (testEnvValidationResult.isErr()) {
    throw new Error(`Test env validation failed: ${testEnvValidationResult.error.message}`)
  }
})
