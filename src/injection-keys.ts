/* eslint-disable @typescript-eslint/naming-convention */
import type { ApiKeyValidator } from '@/api-key-validator'
import type { AppDb } from '@/database/app-db'
import type { KeyValueStore } from '@/database/key-value-store'
import type { EnvConfigType } from '@/env-validator'
import type { SearchService } from '@/search-service'
import type { ConsoleLogger } from '@simwai/utils'
import type { InjectionKey } from 'vue'
import type { SupabaseClientType } from './main'
import type { SocketManager } from './socket-manager'

// Type-safe injection keys - Symbols guarantee uniqueness
export const LOGGER_KEY: InjectionKey<ConsoleLogger> = Symbol('logger')
export const SOCKET_MANAGER_KEY: InjectionKey<SocketManager> = Symbol('socketManager')
export const SUPABASE_CLIENT_KEY: InjectionKey<SupabaseClientType> = Symbol('supabaseClient')
export const API_KEY_VALIDATOR_KEY: InjectionKey<ApiKeyValidator> = Symbol('apiKeyValidator')
export const KEY_VALUE_STORE_KEY: InjectionKey<KeyValueStore> = Symbol('keyValueStore')
export const APP_DB_KEY: InjectionKey<AppDb> = Symbol('appDb')
export const SEARCH_SERVICE_KEY: InjectionKey<SearchService> = Symbol('searchService')
export const ENV_CONFIG_KEY: InjectionKey<EnvConfigType> = Symbol('envConfig')
