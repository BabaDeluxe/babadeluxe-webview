/* eslint-disable @typescript-eslint/naming-convention */
import type { InjectionKey, Ref } from 'vue'
import type { SupabaseClientType } from '@/main'
import type { AbstractLogger } from '@/logger'
import type { EnvConfigType } from '@/env-validator'
import type { AppDb } from '@/database/app-db'
import type { SearchService } from '@/search-service'
import type { KeyValueStore } from '@/database/key-value-store'
import type { SocketManager } from '@/socket-manager'
import type { AnalyticsManager } from '@/analytics/analytics-manager'
import type { IApiKeyValidator } from '@/api-key-validator'
import type { AuthProvider } from '@/auth/auth-provider'

/**
 * Wraps a dependency that is provided before app.mount() but resolved asynchronously
 * (e.g. after socket init). Consumers use isReady/hasError to gate rendering instead
 * of crashing during setup when the value is not yet available.
 * Provided as a reactive object so nested refs are auto-unwrapped for consumers.
 */
export type AsyncInjectable<T> = {
  readonly isReady: boolean
  readonly hasError: boolean
  readonly value: T | undefined
}

export const ENV_CONFIG_KEY: InjectionKey<EnvConfigType> = /* @__PURE__ */ Symbol('ENV_CONFIG_KEY')
export const LOGGER_KEY: InjectionKey<AbstractLogger> = /* @__PURE__ */ Symbol('LOGGER_KEY')
export const APP_DB_KEY: InjectionKey<AppDb> = /* @__PURE__ */ Symbol('APP_DB_KEY')
export const SEARCH_SERVICE_KEY: InjectionKey<SearchService> =
  /* @__PURE__ */ Symbol('SEARCH_SERVICE_KEY')
export const KEY_VALUE_STORE_KEY: InjectionKey<KeyValueStore> =
  /* @__PURE__ */ Symbol('KEY_VALUE_STORE_KEY')
export const SUPABASE_CLIENT_KEY: InjectionKey<SupabaseClientType> =
  /* @__PURE__ */ Symbol('SUPABASE_CLIENT_KEY')
export const SOCKET_MANAGER_KEY: InjectionKey<Ref<SocketManager | undefined>> =
  /* @__PURE__ */ Symbol('SOCKET_MANAGER_KEY')
export const ANALYTICS_MANAGER_KEY: InjectionKey<AnalyticsManager> =
  /* @__PURE__ */ Symbol('ANALYTICS_MANAGER_KEY')
export const API_KEY_VALIDATOR_KEY: InjectionKey<AsyncInjectable<IApiKeyValidator>> =
  /* @__PURE__ */ Symbol('API_KEY_VALIDATOR_KEY')
export const AUTH_PROVIDER_KEY: InjectionKey<AuthProvider> = /* @__PURE__ */ Symbol('authProvider')

import type { VsCodeBridge } from '@/services/vs-code-bridge'
export const VSCODE_BRIDGE_KEY: InjectionKey<VsCodeBridge> =
  /* @__PURE__ */ Symbol('VSCODE_BRIDGE_KEY')

import type { GitMessageComposable } from '@/composables/use-git-message'
export const GIT_MESSAGE_KEY: InjectionKey<GitMessageComposable> =
  /* @__PURE__ */ Symbol('GIT_MESSAGE_KEY')
