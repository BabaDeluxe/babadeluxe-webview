import { ref, computed, inject, onUnmounted } from 'vue'
import { type Result, err, ok, ResultAsync } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import { BaseError } from '@babadeluxe/shared/utils'
import type { SocketManager } from '@/socket-manager'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { ModelsFetchError } from '@/errors'

export class ModelsReloadError extends BaseError {}

const providers = ['openai', 'anthropic', 'gemini'] as const
type Provider = (typeof providers)[number]

export interface Item {
  value: string
  label: string
  icon?: string
  disabled: boolean
}

export interface ItemGroup {
  label: string
  items: Item[]
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

// Generic function that preserves literal types
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
  ] as const),
  anthropic: createExcludePatterns([] as const),
  gemini: createExcludePatterns(['vision', 'robotics', 'veo', 'aqa'] as const),
} as const

const excludeSets: Record<Provider, Set<string>> = {
  openai: new Set(excludePatterns.openai),
  anthropic: new Set(excludePatterns.anthropic),
  gemini: new Set(excludePatterns.gemini),
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

const filterModels = (models: string[], excludeSet: Set<string>): string[] => {
  const result: string[] = []
  for (const model of models) {
    if (!shouldExcludeModel(model.toLowerCase(), excludeSet)) {
      result.push(stripPrefix(model))
    }
  }
  return result
}

const filterModelsByProvider = (
  rawModels: Record<Provider, string[]>
): Record<Provider, string[]> => {
  const filtered: Record<Provider, string[]> = {
    openai: [],
    anthropic: [],
    gemini: [],
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
    gemini: 'i-simple-icons:google',
  }
  return icons[provider]
}

const getProviderDisplayName = (provider: Provider): string => {
  const displayNames: Record<Provider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
  }
  return displayNames[provider]
}

const models = ref<Record<Provider, string[]>>({
  openai: [],
  anthropic: [],
  gemini: [],
})

const isLoadingModels = ref(false)
const modelsError = ref<string>()
let fetchPromise: Promise<Result<void, ModelsFetchError>> | undefined

export async function initializeModels(
  socketManager: SocketManager,
  logger: ConsoleLogger
): Promise<Result<void, ModelsFetchError>> {
  if (fetchPromise !== undefined) return await fetchPromise

  isLoadingModels.value = true
  modelsError.value = undefined

  const fetchWork = async (): Promise<Result<void, ModelsFetchError>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).__TEST_MODELS__) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testModels = (window as any).__TEST_MODELS__
      models.value = filterModelsByProvider(testModels)
      modelsLoadedCount.value++
      logger.log('Using test models')
      isLoadingModels.value = false
      return ok()
    }

    const modelsSocket = socketManager.modelsSocket

    const waitResult = await modelsSocket.waitForConnection()

    if (waitResult.isErr()) {
      const error = waitResult.error
      modelsError.value = error.message
      logger.error('Failed to connect to socket:', error)
      isLoadingModels.value = false
      return err(new ModelsFetchError(error instanceof Error ? error.message : 'Unknown exception'))
    }

    const listResult = await ResultAsync.fromPromise(
      new Promise<{ openai: string[]; anthropic: string[]; gemini: string[] }>(
        (resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new ModelsFetchError('Request timeout after 15s'))
          }, 15000)

          modelsSocket.emit(
            'models:listAllModels',
            (response: {
              success: boolean
              models?: {
                openai: Array<{ modelId: string; contextWindow?: number; source?: string }>
                anthropic: Array<{ modelId: string; contextWindow?: number; source?: string }>
                gemini: Array<{ modelId: string; contextWindow?: number; source?: string }>
              }
              error?: string
            }) => {
              clearTimeout(timeoutId)

              if (!response.success) {
                reject(new ModelsFetchError(response.error || 'Backend returned success: false'))
                return
              }

              if (response.models === undefined) {
                reject(new ModelsFetchError('Backend returned empty models'))
                return
              }

              resolve({
                openai: response.models.openai.map((message) => message.modelId),
                anthropic: response.models.anthropic.map((message) => message.modelId),
                gemini: response.models.gemini.map((message) => message.modelId),
              })
            }
          )
        }
      ),
      (error) => (error instanceof ModelsFetchError ? error : new ModelsFetchError(String(error)))
    )

    if (listResult.isErr()) {
      modelsError.value = listResult.error.message
      logger.error('Failed to fetch models:', listResult.error.message)
      isLoadingModels.value = false
      return err(listResult.error)
    }

    const rawModels = listResult.value
    models.value = filterModelsByProvider(rawModels)
    modelsError.value = undefined
    modelsLoadedCount.value++
    logger.log('Models loaded and filtered')
    isLoadingModels.value = false

    return ok()
  }

  fetchPromise = fetchWork()
  const fetchResult = await fetchPromise
  fetchPromise = undefined

  return fetchResult
}

export function useModelsSocket() {
  const socketManager: SocketManager = inject(SOCKET_MANAGER_KEY)!
  const logger: ConsoleLogger = inject(LOGGER_KEY)!
  const modelsSocket = socketManager.modelsSocket

  const handleModelsUpdate = async () => {
    logger.log('Reloading models due to server update')
    fetchPromise = undefined
    const initResult = await initializeModels(socketManager, logger)

    if (initResult.isErr()) {
      logger.error('Failed to reload models after server update:', initResult.error)
    }
  }

  modelsSocket.on('models:updated', handleModelsUpdate)

  onUnmounted(() => {
    modelsSocket.off('models:updated', handleModelsUpdate)
  })

  const groupedModels = computed<ItemGroup[]>(() => {
    return providers
      .map((provider) => ({
        label: getProviderDisplayName(provider),
        items: models.value[provider].map((model) => ({
          value: `${provider}:${model}`,
          label: model,
          icon: getProviderIcon(provider),
          disabled: false,
        })),
      }))
      .filter((group) => group.items.length > 0)
  })

  const reload = async (): Promise<Result<void, ModelsFetchError>> => {
    logger.log('Forcing models reload')
    fetchPromise = undefined
    return await initializeModels(socketManager, logger)
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
