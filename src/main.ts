import { type App as VueApp, type Ref, createApp, ref } from 'vue'
import { createPinia } from 'pinia'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createColorino, themePalettes } from 'colorino'
import 'virtual:uno.css'
import '@/assets/main.css'
import App from '@/App.vue'
import { KeyValueDb } from '@/database/key-value-db'
import { createAppRouter } from '@/routes'
import { ApiKeyValidator, LocalApiKeyValidator, type IApiKeyValidator } from '@/api-key-validator'
import { validateEnvConfig, type EnvConfigType, isOfflineMode } from '@/env-validator'
import { AppDb } from '@/database/app-db'
import { SearchService } from '@/search-service'
import { KeyValueStore } from '@/database/key-value-store'
import {
  API_KEY_VALIDATOR_KEY,
  ANALYTICS_MANAGER_KEY,
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
import { AnalyticsManager } from '@/analytics/analytics-manager'
import { GoogleAnalyticsProvider } from '@/analytics/providers/google-analytics-provider'
import { StatsigProvider } from '@/analytics/providers/statsig-provider'

export type SupabaseClientType = SupabaseClient

class AppInitializer {
  private readonly _logger = createColorino(themePalettes['catppuccin-mocha'])
  private readonly _socketManagerRef: Ref<SocketManager | undefined> = ref(undefined)

  private _envConfig!: EnvConfigType
  private _supabase!: SupabaseClientType

  async bootstrap(): Promise<void> {
    this._validateEnv()

    const app = this._createApp()
    this._provideBaseDependencies(app)
    this._provideAnalytics(app)
    this._setupDatabaseAndSearch(app)
    this._setupRouter(app)

    app.mount('#app')

    await this._initializeAsyncDependencies(app)
  }

  private _validateEnv(): void {
    const envValidationResult = validateEnvConfig()
    if (envValidationResult.isErr()) {
      throw envValidationResult.error
    }

    this._envConfig = envValidationResult.value
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

      const toastStore = useToastStore()
      toastStore.error('An unexpected error occurred.')
    }

    return app
  }

  private _provideBaseDependencies(app: VueApp): void {
    app.provide(ENV_CONFIG_KEY, this._envConfig)
    app.provide(LOGGER_KEY, this._logger)
    app.provide(SOCKET_MANAGER_KEY, this._socketManagerRef)

    const isBackendless = isOfflineMode()

    const supabaseUrl = isBackendless
      ? 'https://backendless.local'
      : this._envConfig.VITE_SUPABASE_URL!

    const supabaseAnonKey = isBackendless
      ? 'backendless-anon-key'
      : this._envConfig.VITE_SUPABASE_ANON_KEY!

    this._supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: !isBackendless,
        autoRefreshToken: !isBackendless,
        detectSessionInUrl: !isBackendless,
      },
    })

    app.provide(SUPABASE_CLIENT_KEY, this._supabase)

    if (isBackendless) {
      const localApiKeyValidator: IApiKeyValidator = new LocalApiKeyValidator()
      app.provide(API_KEY_VALIDATOR_KEY, localApiKeyValidator)
      return
    }
  }

  private _provideAnalytics(app: VueApp): void {
    const analyticsManager = new AnalyticsManager()

    if (this._envConfig.VITE_GA_MEASUREMENT_ID) {
      analyticsManager.addProvider(
        new GoogleAnalyticsProvider(this._logger, this._envConfig.VITE_GA_MEASUREMENT_ID)
      )
    }

    if (this._envConfig.VITE_STATSIG_CLIENT_KEY) {
      analyticsManager.addProvider(
        new StatsigProvider(this._logger, this._envConfig.VITE_STATSIG_CLIENT_KEY)
      )
    }

    app.provide(ANALYTICS_MANAGER_KEY, analyticsManager)
  }

  private _setupDatabaseAndSearch(app: VueApp): void {
    const appDb = new AppDb(this._logger)
    const searchService = new SearchService(appDb, this._logger)
    const keyValueDb = new KeyValueDb()
    const keyValueStore = new KeyValueStore(keyValueDb, this._logger)

    app.provide(APP_DB_KEY, appDb)
    app.provide(SEARCH_SERVICE_KEY, searchService)
    app.provide(KEY_VALUE_STORE_KEY, keyValueStore)
  }

  private _setupRouter(app: VueApp): void {
    const router = createAppRouter(this._supabase)
    app.use(router)
  }

  private async _initializeAsyncDependencies(app: VueApp): Promise<void> {
    if (isOfflineMode()) {
      this._logger.warn('Running in backendless mode. Backend services disabled.')
      return
    }

    const {
      data: { session },
    } = await this._supabase.auth.getSession()

    if (!session?.access_token) {
      this._logger.warn('No active session found. Router will handle redirect to /.')
      return
    }

    const socketUrl = this._envConfig.VITE_SOCKET_URL
    if (!socketUrl) {
      this._logger.error('Socket initialization skipped because VITE_SOCKET_URL is missing.')
      return
    }

    this._logger.log('Auth valid. Initializing SocketManager...')

    const socketManager = new SocketManager(this._logger, socketUrl, session.access_token)

    const initResult = await socketManager.init()
    if (initResult.isErr()) {
      this._logger.error('Socket initialization failed during app boot', {
        socketUrl,
        error: initResult.error,
      })
      return
    }

    this._socketManagerRef.value = socketManager

    const apiKeyValidator: IApiKeyValidator = new ApiKeyValidator(
      this._logger,
      socketManager.validationSocket
    )
    app.provide(API_KEY_VALIDATOR_KEY, apiKeyValidator)

    window.addEventListener('beforeunload', () => {
      socketManager.disconnect()
    })

    await initializeModels(socketManager)
  }
}

new AppInitializer().bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap application:', error)
})
