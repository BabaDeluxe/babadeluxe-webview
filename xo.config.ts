import { type FlatXoConfig } from 'xo'
import sharedConfig from '@babadeluxe/xo-config'

const baseConfig = sharedConfig
const configArray = Array.isArray(baseConfig) ? baseConfig : [baseConfig]

const config: FlatXoConfig = [
  ...configArray,
  {
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/node_modules/**'],
  },
  {
    rules: {
      'import-x/extensions': 0,
      'unicorn/filename-case': 0,
    },
  },
]

export default config
