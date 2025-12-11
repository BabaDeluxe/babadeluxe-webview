import { createApp } from 'vue'
import { err, ok, type Result } from 'neverthrow'
import { createClient } from '@supabase/supabase-js'
import { ConsoleLogger } from '@simwai/utils'
import 'virtual:uno.css'
import '@/assets/main.css'
import App from '@/App.vue'
import { KeyValueDb } from '@/database/key-value-db'
import router from '@/routes'
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
import { AuthTokenError, EnvValidationError } from '@/errors'
import { SocketManager } from '@/socket-manager'
import { initChatSocketListeners } from '@/chat-socket-listener'

const logger = new ConsoleLogger({ isTimeEnabled: false })

const envValidationResult = validateEnvConfig()
if (envValidationResult instanceof EnvValidationError) {
  process.exit(1)
}

// @ts-ignore
const envConfig: EnvConfigType = import.meta.env

// eslint-disable-next-line @typescript-eslint/naming-convention
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SOCKET_URL } = envConfig

const app = createApp(App)

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

app.use(router)
await router.isReady()

const getAuthToken = async (): Promise<Result<string, AuthTokenError>> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    return err(new AuthTokenError(`Authentication failed: ${error.message}`))
  }

  if (!session?.access_token) {
    return err(new AuthTokenError('Not authenticated (no valid access token found)'))
  }

  return ok(session.access_token)
}

const authTokenResult = await getAuthToken()

if (authTokenResult.isErr()) {
  logger.warn('Auth failed:', authTokenResult.error.message)

  await router.push('/login')
  app.mount('#app')
} else {
  const authToken = authTokenResult.value

  const socketManager = new SocketManager(logger, VITE_SOCKET_URL, authToken)
  const socketManagerInitResult = await socketManager.init()
  initChatSocketListeners(socketManager.chatSocket, logger, appDb)

  if (socketManagerInitResult.isErr()) {
    logger.error('Socket initialization failed:', socketManagerInitResult.error)
    process.exit(1)
  }

  logger.log('All socket namespaces connected')
  app.provide(SOCKET_MANAGER_KEY, socketManager)

  const apiKeyValidator = new ApiKeyValidator(logger, socketManager.validationSocket)
  app.provide(API_KEY_VALIDATOR_KEY, apiKeyValidator)

  app.mount('#app')
  window.addEventListener('beforeunload', () => {
    socketManager.disconnect()
  })

  await initializeModels(socketManager, logger)
}
