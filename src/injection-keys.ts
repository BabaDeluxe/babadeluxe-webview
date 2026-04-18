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

export const envConfigKey: InjectionKey<EnvConfigType> = Symbol('envConfigKey')
export const loggerKey: InjectionKey<AbstractLogger> = Symbol('loggerKey')
export const appDbKey: InjectionKey<AppDb> = Symbol('appDbKey')
export const searchServiceKey: InjectionKey<SearchService> = Symbol('searchServiceKey')
export const keyValueStoreKey: InjectionKey<KeyValueStore> = Symbol('keyValueStoreKey')
export const supabaseClientKey: InjectionKey<SupabaseClientType> = Symbol('supabaseClientKey')
export const socketManagerKey: InjectionKey<Ref<SocketManager | undefined>> =
  Symbol('socketManagerKey')
export const analyticsManagerKey: InjectionKey<AnalyticsManager> = Symbol('analyticsManagerKey')
export const apiKeyValidatorKey: InjectionKey<IApiKeyValidator> = Symbol('apiKeyValidatorKey')
