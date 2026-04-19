/* eslint-disable @typescript-eslint/naming-convention */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NODE_ENV?: 'development' | 'production' | 'test'
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SOCKET_URL?: string
  readonly VITE_OFFLINE_MODE?: string
  readonly VITE_GA_MEASUREMENT_ID?: string
  readonly VITE_STATSIG_CLIENT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
