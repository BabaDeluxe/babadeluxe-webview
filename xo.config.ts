import sharedConfig from '@babadeluxe/xo-config'
import { type FlatXoConfig, type XoConfigItem } from 'xo'
import vueParser from 'vue-eslint-parser'
import vuePlugin from 'eslint-plugin-vue'
import tsParser from '@typescript-eslint/parser'

const configArray: FlatXoConfig = Array.isArray(sharedConfig) ? sharedConfig : [sharedConfig]

// Convert Vue's flat/recommended to XO-compatible format
const vueRecommended = vuePlugin.configs['flat/recommended'] as Array<{
  [key: string]: any
  files?: Array<string | string[]>
}>

// Normalize each Vue config item to match XO's type requirements
for (const vueConfig of vueRecommended) {
  const xoConfig: XoConfigItem = {
    ...vueConfig,
    // Flatten nested arrays: (string | string[])[] → string[]
    files: vueConfig.files ? vueConfig.files.flat() : undefined,
  }
  configArray.push(xoConfig)
}

configArray.push(
  {
    files: ['**/*.vue'],
    prettier: 'compat',
    languageOptions: {
      parser: vueParser,
      sourceType: 'module',
      ecmaVersion: 'latest',
      parserOptions: {
        parser: tsParser, // For <script> blocks
        ecmaFeatures: {
          jsx: false,
        },
      },
    },
  },
  {
    files: ['**/*.vue', '**/*.ts'],
    prettier: 'compat',
    rules: {
      'import-x/extensions': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/prefer-string-replace-all': 'off',
      'no-warning-comments': 'off',
    },
  }
)

export default configArray
