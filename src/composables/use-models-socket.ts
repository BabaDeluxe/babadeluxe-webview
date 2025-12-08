import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'
import { err, ok, Result, ResultAsync } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketManager } from '@/socket-manager'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { ModelsFetchError, PostMessageError } from '@/errors'

const providers = ['openai', 'anthropic', 'gemini'] as const
type Provider = (typeof providers)[number]

interface Item {
  value: string
  label: string
  icon?: string
}

interface ItemGroup {
  label: string
  items: Item[]
}

const stripModelPrefix = (models: string[]): string[] => {
  const result: string[] = []
  for (const model of models) {
    const cleaned = model.startsWith('models/') ? model.slice(7) : model
    result.push(cleaned)
  }
  return result
}

const modelFilters: Record<Provider, (models: string[]) => string[]> = {
  openai: (models: string[]) => {
    const excludePatterns = [
      'tts',
      'audio',
      'realtime',
      'video',
      'image',
      'embedding',
      'transcribe',
      'moderation',
      'whisper',
      'computer',
      'sora',
      'dall',
    ]
    const result: string[] = []
    for (const model of models) {
      const lowerModel = model.toLowerCase()
      let shouldExclude = false
      for (const pattern of excludePatterns) {
        if (lowerModel.includes(pattern)) {
          shouldExclude = true
          break
        }
      }
      if (!shouldExclude) {
        const cleaned = model.startsWith('models/') ? model.slice(7) : model
        result.push(cleaned)
      }
    }
    return result
  },
  anthropic: stripModelPrefix,
  gemini: (models: string[]) => {
    const excludePatterns = [
      'tts',
      'audio',
      'video',
      'image',
      'vision',
      'embedding',
      'robotics',
      'veo',
      'aqa',
      'computer',
    ]
    const result: string[] = []
    for (const model of models) {
      const lowerModel = model.toLowerCase()
      let shouldExclude = false
      for (const pattern of excludePatterns) {
        if (lowerModel.includes(pattern)) {
          shouldExclude = true
          break
        }
      }

      if (!shouldExclude) {
        const cleaned = model.startsWith('models/') ? model.slice(7) : model
        result.push(cleaned)
      }
    }
    return result
  },
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
    const filterFn = modelFilters[provider]
    filtered[provider] = filterFn(rawModels[provider])
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

// Singleton state
const models = ref<Record<Provider, string[]>>({
  openai: [],
  anthropic: [],
  gemini: [],
})
const isLoadingModels = ref(false)
const modelsError = ref<string>()
let fetchPromise: Promise<Result<void, ModelsFetchError>> | undefined

// Standalone init function
export async function initializeModels(
  socketManager: SocketManager,
  logger: ConsoleLogger
): Promise<Result<void, ModelsFetchError>> {
  if (fetchPromise !== undefined) {
    return await fetchPromise
  }

  isLoadingModels.value = true
  modelsError.value = undefined

  const fetchWork = async (): Promise<Result<void, ModelsFetchError>> => {
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
            'listAllModels',
            (response: {
              success: boolean
              models?: { openai: string[]; anthropic: string[]; gemini: string[] }
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

              resolve(response.models)
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
    logger.log('Models loaded and filtered')
    isLoadingModels.value = false

    return ok()
  }

  fetchPromise = fetchWork()
  const fetchResult = await fetchPromise
  fetchPromise = undefined

  return fetchResult
}

const modelsChannel = new BroadcastChannel('models-sync')

// Force reload (on e.g. LLM API key change of user)
export async function reloadModels(
  socketManager: SocketManager,
  logger: ConsoleLogger
): Promise<Result<void, ModelsFetchError | PostMessageError>> {
  logger.log('🔄 Forcing models reload...')
  fetchPromise = undefined

  const initResult = await initializeModels(socketManager, logger)
  if (initResult.isErr()) return err(initResult.error)

  // Notify other tabs
  const postResult = Result.fromThrowable(
    () => {
      modelsChannel.postMessage({ type: 'reload' })
    },
    (error) =>
      new PostMessageError(error instanceof DOMException ? error.message : 'Unknown exception')
  )()

  if (postResult.isErr()) {
    logger.warn('Failed to notify other tabs:', postResult.error.message)
  }

  // Success even if broadcast fails, because it's not mandatory to receive the update on each tab to make the application work
  return ok(undefined)
}

modelsChannel.onmessage = (event) => {
  if (event.data.type === 'reload') {
    console.log('🔔 Models reload triggered by another tab')
    fetchPromise = undefined
  }
}

// Composable for components
export function useModelsSocket() {
  const socketManager: SocketManager = inject(SOCKET_MANAGER_KEY)!
  const logger: ConsoleLogger = inject(LOGGER_KEY)!

  const groupedModels = computed<ItemGroup[]>(() => {
    return providers.map((provider) => ({
      label: getProviderDisplayName(provider),
      items: models.value[provider].map((model) => ({
        value: `${provider}:${model}`,
        label: model,
        icon: getProviderIcon(provider),
      })),
    }))
  })

  const reload = async (): Promise<Result<void, ModelsFetchError | PostMessageError>> =>
    await reloadModels(socketManager, logger)

  // Auto-reload when other tabs update
  const handleMessage = async (event: MessageEvent) => {
    if (event.data.type === 'reload' && socketManager && logger) {
      logger.log('🔔 Reloading models due to cross-tab update')
      fetchPromise = undefined
      const initResult = await initializeModels(socketManager, logger)

      if (initResult.isErr()) {
        logger.error('Failed to reload from cross-tab:', initResult.error)
      }
    }
  }

  onMounted(() => {
    modelsChannel.addEventListener('message', handleMessage)
  })

  onBeforeUnmount(() => {
    modelsChannel.removeEventListener('message', handleMessage)
  })

  return {
    models,
    groupedModels,
    isLoadingModels,
    modelsError,
    reloadModels: reload,
  }
}
