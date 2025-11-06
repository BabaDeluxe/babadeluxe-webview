import { ref, inject, computed } from 'vue'
import { ResultAsync } from 'neverthrow'
import type { ConsoleLogger } from '@simwai/utils'
import type { SocketManager } from '@/socket-manager'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'

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

class SocketConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SocketConnectionError'
  }
}

class ModelsFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelsFetchError'
  }
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
      if (shouldExclude) continue
      const cleaned = model.startsWith('models/') ? model.slice(7) : model
      result.push(cleaned)
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
      if (shouldExclude) continue
      const cleaned = model.startsWith('models/') ? model.slice(7) : model
      result.push(cleaned)
    }
    return result
  },
}

export function useModelsSocket() {
  const socketManager = inject(SOCKET_MANAGER_KEY) as SocketManager | null
  const logger: ConsoleLogger = inject(LOGGER_KEY)!

  if (!socketManager) {
    throw new Error('SocketManager not initialized')
  }

  const modelsSocket = socketManager.modelsSocket
  const models = ref<Record<Provider, string[]>>({
    openai: [],
    anthropic: [],
    gemini: [],
  })
  const isLoadingModels = ref(false)
  const modelsError = ref<string>()

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

  const emitListAllModels = (): ResultAsync<
    { openai: string[]; anthropic: string[]; gemini: string[] },
    ModelsFetchError
  > => {
    return ResultAsync.fromPromise(
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

              if (!response.models) {
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
  }

  const fetchAllModels = async (): Promise<void> => {
    isLoadingModels.value = true
    modelsError.value = undefined

    const waitResult = await modelsSocket.waitForConnection()
    if (waitResult.isErr()) {
      modelsError.value = new SocketConnectionError(waitResult.error.message).message
      logger.error('Failed to connect to socket:', waitResult.error)
      isLoadingModels.value = false
      return
    }

    const result = await emitListAllModels()

    result.match(
      (rawModels) => {
        models.value = filterModelsByProvider(rawModels)
        logger.log('✅ Models loaded and filtered')
      },
      (error) => {
        logger.error('❌ Failed to fetch models:', error.message)
        modelsError.value = error.message
      }
    )

    isLoadingModels.value = false
  }

  return { models, groupedModels, isLoadingModels, modelsError, fetchAllModels }
}
