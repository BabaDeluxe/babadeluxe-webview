import { computed, type Ref } from 'vue'
import type { Result } from 'neverthrow'
import type { ModelTemperatures, ModelTopPs, ModelTopKs, ReasoningEffort } from '@babadeluxe/shared'
import {
  resetModelTemperature,
  setModelTemperature,
  validateSetting,
  resetModelTopP,
  setModelTopP,
  resetModelTopK,
  setModelTopK,
} from '@babadeluxe/shared'
import { toUserMessage } from '@/error-mapper'
import type { AbstractLogger } from '@/logger'
import type { useToastStore } from '@/stores/use-toast-store'

type UpsertFn = (
  key: string,
  value: unknown,
  dataType: 'string' | 'number' | 'boolean' | 'json-object' | 'json-array'
) => Promise<Result<void, unknown>>

export function useSettingsModelPreferences(
  settings:
    | Ref<readonly { settingKey: string; settingValue: unknown }[]>
    | { value: readonly { settingKey: string; settingValue: unknown }[] },
  upsertSetting: UpsertFn,
  logger: AbstractLogger,
  toasts: ReturnType<typeof useToastStore>
) {
  // ─── Temperature ──────────────────────────────────────────────────────────

  const modelTemperatures = computed<ModelTemperatures>(() => {
    const s = settings.value.find((setting) => setting.settingKey === 'modelTemperatures')
    return (s?.settingValue as ModelTemperatures) ?? {}
  })

  function getTemperatureForModel(modelValue: string): number | undefined {
    return modelTemperatures.value[modelValue]
  }

  async function persistTemperatures(next: ModelTemperatures): Promise<void> {
    const result = await upsertSetting('modelTemperatures', next, 'string')
    if (result.isErr()) {
      logger.error('Failed to save model temperatures', { error: result.error })
      toasts.error(toUserMessage(result.error))
    }
  }

  async function handleTemperatureChange(modelValue: string, value: number): Promise<void> {
    const next = setModelTemperature(modelTemperatures.value, modelValue, value)
    const validation = validateSetting('modelTemperatures', next)
    if (!validation.success) return
    await persistTemperatures(next)
  }

  async function handleTemperatureReset(modelValue: string): Promise<void> {
    await persistTemperatures(resetModelTemperature(modelTemperatures.value, modelValue))
  }

  // ─── Top P ─────────────────────────────────────────────────────────────────

  const modelTopPs = computed<ModelTopPs>(() => {
    const s = settings.value.find((setting) => setting.settingKey === 'modelTopPs')
    return (s?.settingValue as ModelTopPs) ?? {}
  })

  function getTopPForModel(modelValue: string): number | undefined {
    return modelTopPs.value[modelValue]
  }

  async function persistTopPs(next: ModelTopPs): Promise<void> {
    const result = await upsertSetting('modelTopPs', next, 'string')
    if (result.isErr()) {
      logger.error('Failed to save model top_p values', { error: result.error })
      toasts.error(toUserMessage(result.error))
    }
  }

  async function handleTopPChange(modelValue: string, value: number): Promise<void> {
    const next = setModelTopP(modelTopPs.value, modelValue, value)
    const validation = validateSetting('modelTopPs', next)
    if (!validation.success) return
    await persistTopPs(next)
  }

  async function handleTopPReset(modelValue: string): Promise<void> {
    await persistTopPs(resetModelTopP(modelTopPs.value, modelValue))
  }

  // ─── Top K ─────────────────────────────────────────────────────────────────

  const modelTopKs = computed<ModelTopKs>(() => {
    const s = settings.value.find((setting) => setting.settingKey === 'modelTopKs')
    return (s?.settingValue as ModelTopKs) ?? {}
  })

  function getTopKForModel(modelValue: string): number | undefined {
    return modelTopKs.value[modelValue]
  }

  async function persistTopKs(next: ModelTopKs): Promise<void> {
    const result = await upsertSetting('modelTopKs', next, 'string')
    if (result.isErr()) {
      logger.error('Failed to save model top_k values', { error: result.error })
      toasts.error(toUserMessage(result.error))
    }
  }

  async function handleTopKChange(modelValue: string, value: number): Promise<void> {
    const next = setModelTopK(modelTopKs.value, modelValue, value)
    const validation = validateSetting('modelTopKs', next)
    if (!validation.success) return
    await persistTopKs(next)
  }

  async function handleTopKReset(modelValue: string): Promise<void> {
    await persistTopKs(resetModelTopK(modelTopKs.value, modelValue))
  }

  // ─── Reasoning Effort ──────────────────────────────────────────────────────

  const reasoningEffort = computed<ReasoningEffort | undefined>(() => {
    const s = settings.value.find((setting) => setting.settingKey === 'reasoningEffort')
    return s?.settingValue as ReasoningEffort | undefined
  })

  function getReasoningEffortForModel(modelValue: string): ReasoningEffort | undefined {
    void modelValue
    return reasoningEffort.value
  }

  async function persistReasoningEffort(next: ReasoningEffort): Promise<void> {
    const result = await upsertSetting('reasoningEffort', next, 'string')
    if (result.isErr()) {
      logger.error('Failed to save reasoning effort', { error: result.error })
      toasts.error(toUserMessage(result.error))
    }
  }

  async function resetReasoningEffort(): Promise<void> {
    const result = await upsertSetting('reasoningEffort', undefined, 'string')
    if (result.isErr()) {
      logger.error('Failed to reset reasoning effort', { error: result.error })
      toasts.error(toUserMessage(result.error))
    }
  }

  async function handleReasoningEffortChange(
    modelValue: string,
    value: ReasoningEffort
  ): Promise<void> {
    void modelValue
    const validation = validateSetting('reasoningEffort', value)
    if (!validation.success) return
    await persistReasoningEffort(value)
  }

  async function handleReasoningEffortReset(modelValue: string): Promise<void> {
    void modelValue
    await resetReasoningEffort()
  }

  return {
    getTemperatureForModel,
    handleTemperatureChange,
    handleTemperatureReset,
    getTopPForModel,
    handleTopPChange,
    handleTopPReset,
    getTopKForModel,
    handleTopKChange,
    handleTopKReset,
    getReasoningEffortForModel,
    handleReasoningEffortChange,
    handleReasoningEffortReset,
  }
}
