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

export const ENV_CONFIG_KEY: InjectionKey<EnvConfigType> = Symbol('ENV_CONFIG_KEY')
export const LOGGER_KEY: InjectionKey<AbstractLogger> = Symbol('LOGGER_KEY')
export const APP_DB_KEY: InjectionKey<AppDb> = Symbol('APP_DB_KEY')
export const SEARCH_SERVICE_KEY: InjectionKey<SearchService> = Symbol('SEARCH_SERVICE_KEY')
export const KEY_VALUE_STORE_KEY: InjectionKey<KeyValueStore> = Symbol('KEY_VALUE_STORE_KEY')
export const SUPABASE_CLIENT_KEY: InjectionKey<SupabaseClientType> = Symbol('SUPABASE_CLIENT_KEY')
export const SOCKET_MANAGER_KEY: InjectionKey<Ref<SocketManager | undefined>> =
  Symbol('SOCKET_MANAGER_KEY')
export const ANALYTICS_MANAGER_KEY: InjectionKey<AnalyticsManager> = Symbol('ANALYTICS_MANAGER_KEY')
export const API_KEY_VALIDATOR_KEY: InjectionKey<IApiKeyValidator> = Symbol('API_KEY_VALIDATOR_KEY')
