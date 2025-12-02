import { createApp } from 'vue'
import { ConsoleLogger } from '@simwai/utils'
import 'virtual:uno.css'
import { createClient } from '@supabase/supabase-js'
import './assets/main.css'
import App from './App.vue'
import { KeyValueDb } from './database/key-value-db'
import router from './routes'
import { SocketManager } from './socket-manager'
import { ApiKeyValidator } from './api-key-validator'
import { validateEnvConfig } from './env-validator'
import { AppDb } from './database/app-db'
import { SearchService } from './search-service'
import { KeyValueStore } from './database/key-value-store'
import { err, ok, type Result } from 'neverthrow'
import {
  API_KEY_VALIDATOR_KEY,
  APP_DB_KEY,
  ENV_CONFIG_KEY,
  KEY_VALUE_STORE_KEY,
  LOGGER_KEY,
  SEARCH_SERVICE_KEY,
  SOCKET_MANAGER_KEY,
  SUPABASE_CLIENT_KEY,
} from './injection-keys'
import { initializeModels } from './composables/use-models-socket'
import { BaseError } from './base-error'

class EnvConfigError extends BaseError {}

class AuthTokenError extends BaseError {}

class AppLogger extends ConsoleLogger {
  fatal(message: string, error: Error): never {
    this.trace(message, error)
    throw error
  }
}

const logger = new AppLogger({ isTimeEnabled: false })
const validationResult = validateEnvConfig()

const envConfig = validationResult.match(
  (config) => config,
  (error) => logger.fatal('Environment config validation failed', new EnvConfigError(error.message))
)

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SOCKET_URL } = envConfig

const app = createApp(App)

app.provide(ENV_CONFIG_KEY, envConfig)
app.provide(LOGGER_KEY, logger)

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
export type SupabaseClientType = typeof supabase

app.provide(SUPABASE_CLIENT_KEY, supabase)

const apiKeyValidator = new ApiKeyValidator(logger)
app.provide(API_KEY_VALIDATOR_KEY, apiKeyValidator)

const appDb = new AppDb(logger)
const searchService = new SearchService(appDb, logger)
app.provide(SEARCH_SERVICE_KEY, searchService)
app.provide(APP_DB_KEY, appDb)

const keyValueDb = new KeyValueDb()
const keyValueStore = new KeyValueStore(keyValueDb)
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
  app.provide(SOCKET_MANAGER_KEY, null)
  app.mount('#app')
  await router.push('/login')
} else {
  const authToken = authTokenResult.value

  const socketManager = new SocketManager(logger, VITE_SOCKET_URL, authToken)
  const socketManagerInitResult = await socketManager.init()

  await socketManagerInitResult.match(
    async () => {
      logger.log('All socket namespaces connected')
      app.provide(SOCKET_MANAGER_KEY, socketManager)

      window.addEventListener('beforeunload', () => {})

      app.mount('#app')
      app.onUnmount(() => {
        socketManager.disconnect()
      })

      await initializeModels(socketManager, logger)
    },
    (error) => {
      logger.error('Socket initialization failed:', error)
      app.provide(SOCKET_MANAGER_KEY, null)
      app.mount('#app')
      // Optionally redirect to error page or show notification
    }
  )
}
