/** @vitest-environment jsdom */
/**
 * Unit test: useApiKeyManagement field-status state machine.
 *
 * Litmus: Pure logic, all external deps stubbed, runs offline in milliseconds.
 * Asserts only observable output (fieldStates values), never mock call counts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, ref } from 'vue'
import { useApiKeyManagement } from '@/composables/use-api-key-management'
import type { IApiKeyValidator } from '@/api-key-validator'
import { ok, err } from 'neverthrow'
import { ValidationError } from '@/errors'
import { createMockLogger } from './helpers/create-mock-logger'

const makeSettings = () =>
  ref([
    {
      settingKey: 'apiKeyOpenai',
      settingValue: '',
      dataType: 'string' as const,
      updatedAt: new Date(),
      category: 'api',
      encrypted: true,
      required: true,
      description: 'OpenAI API key',
    },
  ])

const mountComposable = (validator: IApiKeyValidator) => {
  const validatorRef = computed(() => validator)
  return useApiKeyManagement(
    validatorRef,
    createMockLogger(),
    vi.fn().mockResolvedValue(undefined),
    vi.fn().mockResolvedValue(ok([])),
    () => 'test-user',
    makeSettings()
  )
}

describe('useApiKeyManagement — field-status state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('field status is idle before any input', () => {
    const { fieldStates } = mountComposable({ validate: vi.fn() })

    expect(fieldStates.value['apiKeyOpenai'].status).toBe('idle')
  })

  it('field status resets to idle when input is cleared', async () => {
    const { fieldStates, handleApiKeyInput } = mountComposable({ validate: vi.fn() })

    handleApiKeyInput('apiKeyOpenai', 'sk-something')
    handleApiKeyInput('apiKeyOpenai', '')
    await vi.runAllTimersAsync()

    expect(fieldStates.value['apiKeyOpenai'].status).toBe('idle')
  })

  it('field status becomes valid after successful validation', async () => {
    const { fieldStates, handleApiKeyInput } = mountComposable({
      validate: vi.fn().mockResolvedValue(ok(true)),
    })

    handleApiKeyInput('apiKeyOpenai', 'sk-validkey12345678901234567890')
    await vi.runAllTimersAsync()

    expect(fieldStates.value['apiKeyOpenai'].status).toBe('valid')
  })

  it('field status becomes invalid with error message when validation fails', async () => {
    const { fieldStates, handleApiKeyInput } = mountComposable({
      validate: vi.fn().mockResolvedValue(err(new ValidationError('Bad key'))),
    })

    handleApiKeyInput('apiKeyOpenai', 'sk-badkey1234567890123456789012')
    await vi.runAllTimersAsync()

    expect(fieldStates.value['apiKeyOpenai'].status).toBe('invalid')
    expect(fieldStates.value['apiKeyOpenai'].error).toBeTruthy()
  })
})
