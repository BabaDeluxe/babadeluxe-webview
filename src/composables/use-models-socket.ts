import { ref, computed, onUnmounted, watch, readonly } from 'vue'
import { type Result, err, ok, ResultAsync } from 'neverthrow'
import type { AbstractLogger } from '@/logger'
import type { SocketManager } from '@/socket-manager'
import { loggerKey } from '@/injection-keys'
import { NetworkError } from '@/errors'
import { safeInject } from '@/safe-inject'
import { socketTimeoutMs } from '@/constants'
import { useSocketManager } from '@/composables/use-socket-manager'
import { useTrackedTimeouts } from '@/composables/use-tracked-timeouts'
import { retryWithBackoff } from '@/retry'
import {
  modelsSocketConnectionFailed,
  requestTimeout15s,
  backendReturnedSuccessFalse,
  backendReturnedEmptyModels,
  failedToListModels,
  socketNotConnected,
  modelsInitializeContext,
  reloadModelsDueToUpdate,
  failedToReloadModels,
} from '@/composables/constants'
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

type RawModel = { modelId: string; contextWindow?: number; source?: string }
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
const models = ref<Record<Provider, RawModel[]>>({
  openai: [],
  anthropic: [],
  gemini: [],
  ollama: [],
  deepseek: [],
})

const isLoadingModels = ref(false)
const modelsError = ref<NetworkError | undefined>()
let fetchPromise: Promise<Result<void, NetworkError>> | undefined
type Timeouts = {
  createTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancelTimeout: (id: ReturnType<typeof setTimeout>) => void
}
type ModelsUpdateHandler = () => void
const updateHandlerBySocket = new WeakMap<object, ModelsUpdateHandler>()

/**
 * Ensures that the 'models:updated' listener is attached to the given socket.
 * Uses a WeakMap to cache the handler per socket instance, preventing duplicate listeners.
 */
function ensureModelsSocketListeners(
  modelsSocket: SocketManager['modelsSocket'],
  logger: AbstractLogger,
  timeouts: Timeouts
) {
  let handler = updateHandlerBySocket.get(modelsSocket)
  if (!handler) {
    handler = async () => {
      logger.log(reloadModelsDueToUpdate)
      fetchPromise = undefined
      const initResult = await initializeModels(modelsSocket, timeouts)
      if (initResult.isErr()) {
        logger.error(failedToReloadModels, initResult.error)
      }
    }
    updateHandlerBySocket.set(modelsSocket, handler)
  }
  modelsSocket.off('models:updated', handler)
  modelsSocket.on('models:updated', handler)
}
export async function initializeModels(
  modelsSocket: SocketManager['modelsSocket'],
  timeouts?: Timeouts
): Promise<Result<void, NetworkError>> {
  if (fetchPromise !== undefined) return await fetchPromise

  isLoadingModels.value = true
  modelsError.value = undefined

  const fetchWork = async (): Promise<Result<void, NetworkError>> => {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const win = window as unknown as { __TEST_MODELS__?: Record<Provider, RawModel[]> }

    if (typeof window !== 'undefined' && win.__TEST_MODELS__) {
      models.value = filterModelsByProvider(win.__TEST_MODELS__)
      modelsLoadedCount.value++
      isLoadingModels.value = false
      return ok()
    }

    const waitResult = await modelsSocket.waitForConnection()

    if (waitResult.isErr()) {
      return err(new NetworkError(modelsSocketConnectionFailed, waitResult.error))
    }
    const createTimeout =
      timeouts?.createTimeout ?? ((callback, delay) => setTimeout(callback, delay))
    const cancelTimeout =
      timeouts?.cancelTimeout ??
      ((id) => {
        clearTimeout(id)
      })

    const rawModelsResult = await ResultAsync.fromPromise(
      new Promise<{
        openai: RawModel[]
        anthropic: RawModel[]
        gemini: RawModel[]
        ollama: RawModel[]
        deepseek: RawModel[]
      }>((resolve, reject) => {
        const timeoutId = createTimeout(() => {
          reject(new NetworkError(requestTimeout15s))
        }, socketTimeoutMs.models)

        modelsSocket.emit('models:listAllModels', (response) => {
          cancelTimeout(timeoutId)

          if (!response.success) {
            reject(new NetworkError(response.error || backendReturnedSuccessFalse))
            return
          }

          if (response.models === undefined) {
            reject(new NetworkError(backendReturnedEmptyModels))
            return
          }

          resolve({
            openai: response.models.openai,
            anthropic: response.models.anthropic,
            gemini: response.models.gemini,
            ollama: [], // TODO Implement ollama and deepseek
            deepseek: [],
          })
        })
      }),
      (error) => {
        if (error instanceof NetworkError) {
          return error
        }
        return new NetworkError(failedToListModels, error)
      }
    )

    if (rawModelsResult.isErr()) {
      return err(rawModelsResult.error)
    }

    const rawModels = rawModelsResult.value
    models.value = filterModelsByProvider(rawModels)
    modelsLoadedCount.value++

    return ok()
  }

  fetchPromise = retryWithBackoff(fetchWork, modelsInitializeContext, {
    maxRetries: 3,
  })

  const fetchResult = await fetchPromise
  fetchPromise = undefined
  isLoadingModels.value = false

  if (fetchResult.isErr()) {
    modelsError.value = fetchResult.error
  } else {
    modelsError.value = undefined
  }

  return fetchResult
}
export function useModelsSocket() {
  const { socketManagerRef } = useSocketManager()
  const logger: AbstractLogger = safeInject(loggerKey)
  const { createTimeout, cancelTimeout } = useTrackedTimeouts()
  const timeouts: Timeouts = { createTimeout, cancelTimeout }

  watch(
    () => socketManagerRef.value?.modelsSocket,
    (newSocket, oldSocket) => {
      if (oldSocket) {
        const oldHandler = updateHandlerBySocket.get(oldSocket)
        if (oldHandler) oldSocket.off('models:updated', oldHandler)
      }
      if (newSocket) {
        ensureModelsSocketListeners(newSocket, logger, timeouts)
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    const socket = socketManagerRef.value?.modelsSocket
    if (socket) {
      const handler = updateHandlerBySocket.get(socket)
      if (handler) socket.off('models:updated', handler)
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
    if (!socketManagerRef.value?.modelsSocket) {
      const e = new NetworkError(socketNotConnected)
      modelsError.value = e
      return err(e)
    }

    fetchPromise = undefined
    const result = await initializeModels(socketManagerRef.value.modelsSocket, timeouts)
    if (result.isErr()) modelsError.value = result.error
    return result
  }

  return {
    models,
    groupedModels,
    isLoadingModels,
    modelsError: readonly(modelsError),
    modelsLoadedCount,
    reloadModels: reload,
  }
}
