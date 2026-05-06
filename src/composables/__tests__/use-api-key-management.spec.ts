import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, ref } from 'vue'
import { withSetup } from '@/test-utils/with-setup'
import { useApiKeyManagement } from '@/composables/use-api-key-management'
import type { IApiKeyValidator } from '@/api-key-validator'
import { ok } from 'neverthrow'

const makeLogger = () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const makeValidator = (resolves = true): IApiKeyValidator => ({
  validate: vi.fn().mockResolvedValue(resolves ? ok(true) : undefined),
})

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

describe('useApiKeyManagement — ComputedRef<IApiKeyValidator>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('should pass the resolved validator to validate on key input', async () => {
    const validator = makeValidator()
    const validatorRef = computed(() => validator)

    const { result } = withSetup(() =>
      useApiKeyManagement(
        validatorRef,
        makeLogger(),
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue(ok([])),
        () => 'test-user',
        makeSettings()
      )
    )

    result.handleApiKeyInput('apiKeyOpenai', 'sk-validkey12345678901234567890')

    await vi.runAllTimersAsync()

    expect(validator.validate).toHaveBeenCalledWith('openai', 'sk-validkey12345678901234567890')
  })

  it('should not call validate when input is empty', async () => {
    const validator = makeValidator()
    const validatorRef = computed(() => validator)

    const { result } = withSetup(() =>
      useApiKeyManagement(
        validatorRef,
        makeLogger(),
        vi.fn(),
        vi.fn().mockResolvedValue(ok([])),
        () => 'test-user',
        makeSettings()
      )
    )

    result.handleApiKeyInput('apiKeyOpenai', '')
    await vi.runAllTimersAsync()

    expect(validator.validate).not.toHaveBeenCalled()
  })

  it('should set field status to validating then valid on success', async () => {
    const validator = makeValidator(true)
    const validatorRef = computed(() => validator)
    const upsertSetting = vi.fn().mockResolvedValue(undefined)

    const { result } = withSetup(() =>
      useApiKeyManagement(
        validatorRef,
        makeLogger(),
        upsertSetting,
        vi.fn().mockResolvedValue(ok([])),
        () => 'test-user',
        makeSettings()
      )
    )

    result.handleApiKeyInput('apiKeyOpenai', 'sk-validkey12345678901234567890')
    await vi.runAllTimersAsync()

    expect(result.fieldStates.value['apiKeyOpenai'].status).toBe('valid')
    expect(upsertSetting).toHaveBeenCalledWith(
      'apiKeyOpenai',
      'sk-validkey12345678901234567890',
      'string'
    )
  })
})
