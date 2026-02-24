import { ref, computed, onUnmounted, watch } from 'vue'
import { type Result, err, ok, ResultAsync } from 'neverthrow'
import type { AbstractLogger } from '@/logger'
import type { SocketManager } from '@/socket-manager'
import { LOGGER_KEY } from '@/injection-keys'
import { NetworkError } from '@/errors'
import { safeInject } from '@/safe-inject'
import { socketTimeoutMs } from '@/constants'
import { useSocketManager } from '@/composables/use-socket-manager'
import { retryWithBackoff } from '@/retry' // NEW

const providers = ['openai', 'anthropic', 'gemini', 'ollama', 'deepseek'] as const
type Provider = (typeof providers)[number]

export interface ModelItem {
  value: string
  label: string
  icon?: string
  isDisabled: boolean
  contextWindow?: number
}

export interface ModelItemGroup {
  label: string
  items: ModelItem[]
}

const modelsLoadedCount = ref(0)
const modelIdPrefix = 'models/'

const baseExcludePatterns = [
  'tts',
  'audio',
  'video',
  'image',
  'embedding',
  'computer',
  'robot',
] as const

const createExcludePatterns = <T extends readonly string[]>(additional: T) =>
  [...baseExcludePatterns, ...additional] as const

const excludePatterns = {
  openai: createExcludePatterns([
    'realtime',
    'transcribe',
    'moderation',
    'whisper',
    'sora',
    'dall',
    'davinci',
    'babbage',
    'codex',
  ] as const),
  anthropic: createExcludePatterns([] as const),
  gemini: createExcludePatterns(['vision', 'robotics', 'veo', 'aqa', 'banana'] as const),
  ollama: createExcludePatterns([] as const),
  deepseek: createExcludePatterns([] as const),
} as const

const excludeSets: Record<Provider, Set<string>> = {
  openai: new Set(excludePatterns.openai),
  anthropic: new Set(excludePatterns.anthropic),
  gemini: new Set(excludePatterns.gemini),
  ollama: new Set(excludePatterns.ollama),
  deepseek: new Set(excludePatterns.deepseek),
}

const shouldExcludeModel = (modelLower: string, excludeSet: Set<string>): boolean => {
  for (const pattern of excludeSet) {
    if (modelLower.includes(pattern)) {
      return true
    }
  }
  return false
}

const stripPrefix = (model: string): string => {
  return model.startsWith(modelIdPrefix) ? model.slice(modelIdPrefix.length) : model
}

const filterModels = (models: RawModel[], excludeSet: Set<string>): RawModel[] => {
  const result: RawModel[] = []

  for (const model of models) {
    const modelIdLower = model.modelId.toLowerCase()
    if (!shouldExcludeModel(modelIdLower, excludeSet)) {
      result.push({ ...model, modelId: stripPrefix(model.modelId) })
    }
  }
  return result
}

const filterModelsByProvider = (
  rawModels: Record<Provider, RawModel[]>
): Record<Provider, RawModel[]> => {
  const filtered: Record<Provider, RawModel[]> = {
    openai: [],
    anthropic: [],
    gemini: [],
    ollama: [],
    deepseek: [],
  }

  for (const provider of providers) {
    filtered[provider] = filterModels(rawModels[provider], excludeSets[provider])
  }

  return filtered
}

const getProviderIcon = (provider: Provider): string => {
  const icons: Record<Provider, string> = {
    openai: 'i-simple-icons:openai',
    anthropic: 'i-simple-icons:anthropic',
    gemini: 'i-ri:gemini-line',
    ollama: 'i-simple-icons:ollama',
    deepseek: 'i-hugeicons:deepseek',
  }
  return icons[provider]
}

const getProviderDisplayName = (provider: Provider): string => {
  const displayNames: Record<Provider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    ollama: 'Ollama',
    deepseek: 'deepseek',
  }
  return displayNames[provider]
}

type RawModel = { modelId: string; contextWindow?: number; source?: string }

const models = ref<Record<Provider, RawModel[]>>({
  openai: [],
  anthropic: [],
  gemini: [],
  ollama: [],
  deepseek: [],
})

const isLoadingModels = ref(false)
const modelsError = ref<string>()
let fetchPromise: Promise<Result<void, NetworkError>> | undefined

export async function initializeModels(
  socketManager: SocketManager
): Promise<Result<void, NetworkError>> {
  if (fetchPromise !== undefined) return await fetchPromise

  isLoadingModels.value = true
  modelsError.value = undefined

  const fetchWork = async (): Promise<Result<void, NetworkError>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).__TEST_MODELS__) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testModels = (window as any).__TEST_MODELS__ as Record<Provider, RawModel[]>
      models.value = filterModelsByProvider(testModels)
      modelsLoadedCount.value++
      isLoadingModels.value = false
      return ok()
    }

    const modelsSocket = socketManager.modelsSocket
    const waitResult = await modelsSocket.waitForConnection()

    if (waitResult.isErr()) {
      const error = waitResult.error
      modelsError.value = error.message
      isLoadingModels.value = false
      return err(new NetworkError(error instanceof Error ? error.message : 'Unknown exception'))
    }

    const listResult = await ResultAsync.fromPromise(
      new Promise<{
        openai: RawModel[]
        anthropic: RawModel[]
        gemini: RawModel[]
        ollama: RawModel[]
        deepseek: RawModel[]
      }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new NetworkError('Request timeout after 15s'))
        }, socketTimeoutMs.models)

        modelsSocket.emit(
          'models:listAllModels',
          // @ts-expect-error Need new generated types
          (response: {
            success: boolean
            models?: {
              openai: RawModel[]
              anthropic: RawModel[]
              gemini: RawModel[]
              ollama: RawModel[]
              deepseek: RawModel[]
            }
            error?: string
          }) => {
            clearTimeout(timeoutId)

            if (!response.success) {
              reject(new NetworkError(response.error || 'Backend returned success: false'))
              return
            }

            if (response.models === undefined) {
              reject(new NetworkError('Backend returned empty models'))
              return
            }

            resolve({
              openai: response.models.openai,
              anthropic: response.models.anthropic,
              gemini: response.models.gemini,
              // TODO Remove ?? [] after implementing the LLM providers in the backend
              ollama: response.models.ollama ?? [],
              deepseek: response.models.deepseek ?? [],
            })
          }
        )
      }),
      (error) => (error instanceof NetworkError ? error : new NetworkError(String(error)))
    )

    if (listResult.isErr()) {
      modelsError.value = listResult.error.message
      isLoadingModels.value = false
      return err(listResult.error)
    }

    const rawModels = listResult.value
    models.value = filterModelsByProvider(rawModels)
    modelsError.value = undefined
    modelsLoadedCount.value++
    isLoadingModels.value = false

    return ok()
  }

  // NEW: retry on transient NetworkError when listing models
  fetchPromise = retryWithBackoff(fetchWork, 'models:initialize', {
    maxRetries: 3,
  })
  const fetchResult = await fetchPromise
  fetchPromise = undefined

  return fetchResult
}

export function useModelsSocket() {
  const { socketManagerRef } = useSocketManager()
  const logger: AbstractLogger = safeInject(LOGGER_KEY)

  const handleModelsUpdate = async () => {
    logger.log('Reloading models due to server update')
    fetchPromise = undefined
    if (socketManagerRef.value) {
      const initResult = await initializeModels(socketManagerRef.value)
      if (initResult.isErr()) {
        logger.error('Failed to reload models after server update:', initResult.error)
      }
    }
  }

  watch(
    () => socketManagerRef.value?.modelsSocket,
    (newSocket, oldSocket) => {
      if (oldSocket) {
        oldSocket.off('models:updated', handleModelsUpdate)
      }
      if (newSocket) {
        newSocket.on('models:updated', handleModelsUpdate)
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    if (socketManagerRef.value?.modelsSocket) {
      socketManagerRef.value.modelsSocket.off('models:updated', handleModelsUpdate)
    }
  })

  const groupedModels = computed<ModelItemGroup[]>(() => {
    const groups: ModelItemGroup[] = []

    for (const provider of providers) {
      const providerModels = models.value[provider]
      if (!providerModels || providerModels.length === 0) continue

      const items: ModelItem[] = []

      for (const model of providerModels) {
        items.push({
          value: `${provider}:${model.modelId}`,
          label: model.modelId,
          icon: getProviderIcon(provider),
          isDisabled: false,
          contextWindow: model.contextWindow,
        })
      }

      groups.push({
        label: getProviderDisplayName(provider),
        items,
      })
    }

    return groups
  })

  const reload = async (): Promise<Result<void, NetworkError>> => {
    if (!socketManagerRef.value) {
      return err(new NetworkError('Socket not connected'))
    }

    fetchPromise = undefined
    return await initializeModels(socketManagerRef.value)
  }

  return {
    models,
    groupedModels,
    isLoadingModels,
    modelsError,
    modelsLoadedCount,
    reloadModels: reload,
  }
}
