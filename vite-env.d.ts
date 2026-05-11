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
  /** Base path for Vite asset resolution. Use './' for VS Code webview builds, '/' (default) for web deployments. */
  readonly VITE_BASE_URL?: string
  /** Canonical URL of this deployment. Used as the Supabase OAuth redirectTo origin.
   *  Example: https://app.babadeluxe.com  |  https://app-staging.babadeluxe.com */
  readonly VITE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
