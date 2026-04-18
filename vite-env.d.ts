/// <reference types="vite/client" />

interface ImportMetaEnv {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_NODE_ENV?: 'development' | 'production' | 'test'
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_SUPABASE_URL?: string
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_SUPABASE_ANON_KEY?: string
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_SOCKET_URL?: string
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_OFFLINE_MODE?: string
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_GA_MEASUREMENT_ID?: string
  // eslint-disable-next-line @typescript-eslint/naming-convention
  readonly VITE_STATSIG_CLIENT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
