import { type App as VueApp, type Ref, createApp, ref } from 'vue'
import { createPinia } from 'pinia'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

export type SupabaseClientType = SupabaseClient

class AppInitializer {
  private readonly _logger = createColorino(themePalettes['catppuccin-mocha'])
  private _envConfig!: EnvConfigType
  private _supabase!: SupabaseClientType
  private _socketManagerRef = ref<SocketManager | undefined>(undefined)

  async bootstrap(): Promise<void> {
    this._validateEnv()
    const app = this._createApp()
    this._provideBaseDependencies(app)
    this._setupDatabaseAndSearch(app)
    this._setupRouter(app)

    app.mount('#app')

    await this._initializeAsyncDependencies(app)
  }

  private _validateEnv(): void {
    const envValidationResult = validateEnvConfig()
    if (envValidationResult.isErr()) throw envValidationResult.error

    // @ts-ignore
    this._envConfig = import.meta.env
  }

  private _createApp(): VueApp {
    const app = createApp(App)
    const pinia = createPinia()
    app.use(pinia)

    app.config.errorHandler = (err, instance, info) => {
      this._logger.error('Uncaught Vue exception', {
        vueInfo: info,
        componentName: instance?.$options?.name,
        error: err,
      })

      const toasts = useToastStore()
      toasts.error('An unexpected error occurred.')
    }

    return app
  }

  private _provideBaseDependencies(app: VueApp): void {
    app.provide(ENV_CONFIG_KEY, this._envConfig)
    app.provide(LOGGER_KEY, this._logger)

    this._supabase = createClient(this._envConfig.VITE_SUPABASE_URL, this._envConfig.VITE_SUPABASE_ANON_KEY)
    app.provide(SUPABASE_CLIENT_KEY, this._supabase)
  }

  private _setupDatabaseAndSearch(app: VueApp): void {
    const appDb = new AppDb(this._logger)
    const searchService = new SearchService(appDb, this._logger)
    app.provide(SEARCH_SERVICE_KEY, searchService)
    app.provide(APP_DB_KEY, appDb)

    const keyValueDb = new KeyValueDb()
    const keyValueStore = new KeyValueStore(keyValueDb, this._logger)
    app.provide(KEY_VALUE_STORE_KEY, keyValueStore)
  }

  private _setupRouter(app: VueApp): void {
    const router = createAppRouter(this._supabase)
    app.use(router)
    app.provide(SOCKET_MANAGER_KEY, this._socketManagerRef)
  }

  private async _initializeAsyncDependencies(app: VueApp): Promise<void> {
    const {
      data: { session },
    } = await this._supabase.auth.getSession()

    if (!session?.access_token) {
      this._logger.warn('No active session found. Router will handle redirect to /.')
      return
    }

    this._logger.log('Auth valid. Initializing SocketManager...')
    const socketManager = new SocketManager(this._logger, this._envConfig.VITE_SOCKET_URL, session.access_token)

    const initResult = await socketManager.init()
    if (initResult.isErr()) {
      this._logger.error('Socket initialization failed during app boot', {
        socketUrl: this._envConfig.VITE_SOCKET_URL,
        error: initResult.error,
      })
      return
    }

    this._socketManagerRef.value = socketManager
    const apiKeyValidator = new ApiKeyValidator(this._logger, socketManager.validationSocket)
    app.provide(API_KEY_VALIDATOR_KEY, apiKeyValidator)

    window.addEventListener('beforeunload', () => {
      socketManager.disconnect()
    })

    await initializeModels(socketManager)
  }
}

new AppInitializer().bootstrap().catch((error) => {
  console.error('Failed to bootstrap application:', error)
})
