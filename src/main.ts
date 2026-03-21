import { type Ref, createApp, ref } from 'vue'
import { createPinia } from 'pinia'
import { createClient } from '@supabase/supabase-js'
import { createColorino, themePalettes } from 'colorino'
import 'virtual:uno.css'
import '@/assets/main.css'
import App from '@/App.vue'
import { KeyValueDb } from '@/database/key-value-db'
import { createAppRouter } from '@/routes'
import { ApiKeyValidator } from '@/api-key-validator'
import { validateEnvConfig, type EnvConfigType } from '@/env-validator'
import { AppDb } from '@/database/app-db'
import { SearchService } from '@/search-service'
import { KeyValueStore } from '@/database/key-value-store'
import {
  API_KEY_VALIDATOR_KEY,
  APP_DB_KEY,
  ENV_CONFIG_KEY,
  KEY_VALUE_STORE_KEY,
  LOGGER_KEY,
  SEARCH_SERVICE_KEY,
  SOCKET_MANAGER_KEY,
  SUPABASE_CLIENT_KEY,
} from '@/injection-keys'
import { initializeModels } from '@/composables/use-models-socket'
import { SocketManager } from '@/socket-manager'
import { useToastStore } from '@/stores/use-toast-store'

const logger = createColorino(themePalettes['catppuccin-mocha'])

const envValidationResult = validateEnvConfig()
if (envValidationResult.isErr()) throw envValidationResult.error

// @ts-ignore
const envConfig: EnvConfigType = import.meta.env

// eslint-disable-next-line @typescript-eslint/naming-convention
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SOCKET_URL } = envConfig

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

app.config.errorHandler = (err, instance, info) => {
  logger.error('Uncaught Vue exception', {
    vueInfo: info,
    componentName: instance?.$options?.name,
    error: err,
  })

  const toasts = useToastStore()
  toasts.error('An unexpected error occurred.')
}

app.provide(ENV_CONFIG_KEY, envConfig)
app.provide(LOGGER_KEY, logger)

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
export type SupabaseClientType = typeof supabase
app.provide(SUPABASE_CLIENT_KEY, supabase)

const appDb = new AppDb(logger)
const searchService = new SearchService(appDb, logger)
app.provide(SEARCH_SERVICE_KEY, searchService)
app.provide(APP_DB_KEY, appDb)

const keyValueDb = new KeyValueDb()
const keyValueStore = new KeyValueStore(keyValueDb, logger)
app.provide(KEY_VALUE_STORE_KEY, keyValueStore)

const router = createAppRouter(supabase)
app.use(router)
const socketManagerRef: Ref<SocketManager | undefined> = ref(undefined)
app.provide(SOCKET_MANAGER_KEY, socketManagerRef)

app.mount('#app')
;(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    logger.warn('No active session found. Router will handle redirect to /.')
    return
  }

  logger.log('Auth valid. Initializing SocketManager...')
  const socketManager = new SocketManager(logger, VITE_SOCKET_URL, session.access_token)

  const initResult = await socketManager.init()
  if (initResult.isErr()) {
    logger.error('Socket initialization failed during app boot', {
      socketUrl: VITE_SOCKET_URL,
      error: initResult.error,
    })
    return
  }

  socketManagerRef.value = socketManager
  const apiKeyValidator = new ApiKeyValidator(logger, socketManager.validationSocket)
  app.provide(API_KEY_VALIDATOR_KEY, apiKeyValidator)

  window.addEventListener('beforeunload', () => {
    socketManager.disconnect()
  })

  await initializeModels(socketManager)
})()
