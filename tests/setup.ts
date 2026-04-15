import { beforeAll } from 'vitest'
import { validateEnvConfig } from '../src/env-validator'

beforeAll(() => {
  const envValidationResult = validateEnvConfig()
  if (envValidationResult.isErr()) {
    throw new Error(`Application env validation failed: ${envValidationResult.error.message}`)
  }
})
