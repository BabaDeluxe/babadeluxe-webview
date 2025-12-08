import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/node_modules/**',
    '**/.*/**',
  ]),

  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    rules: {
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'separate-type-imports',
        },
      ],
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': [
        'error',
        {
          html: { void: 'always', normal: 'always', component: 'always' },
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },

        // Modern private fields (#syntax)
        {
          selector: 'classProperty',
          modifiers: ['#private'],
          format: ['camelCase'],
        },

        // PARAMETER PROPERTIES - MOST SPECIFIC FIRST
        {
          selector: 'parameterProperty',
          modifiers: ['private', 'readonly'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'parameterProperty',
          modifiers: ['protected', 'readonly'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'parameterProperty',
          modifiers: ['public', 'readonly'],
          format: ['camelCase'],
        },
        {
          selector: 'parameterProperty',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'parameterProperty',
          modifiers: ['protected'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'parameterProperty',
          modifiers: ['public'],
          format: ['camelCase'],
        },

        // CLASS PROPERTIES - Three modifier combinations
        {
          selector: 'classProperty',
          modifiers: ['private', 'static', 'readonly'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['protected', 'static', 'readonly'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['public', 'static', 'readonly'],
          format: ['camelCase'],
        },

        // Two modifier combinations
        {
          selector: 'classProperty',
          modifiers: ['private', 'readonly'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['protected', 'readonly'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['public', 'readonly'],
          format: ['camelCase'],
        },
        {
          selector: 'classProperty',
          modifiers: ['private', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['protected', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['public', 'static'],
          format: ['camelCase'],
        },

        // Single modifier properties
        {
          selector: 'classProperty',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['protected'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classProperty',
          modifiers: ['public'],
          format: ['camelCase'],
        },
        {
          selector: 'classProperty',
          modifiers: ['static'],
          format: ['camelCase'],
        },
        {
          selector: 'classProperty',
          modifiers: ['readonly'],
          format: ['camelCase'],
        },
        {
          selector: 'classProperty',
          format: ['camelCase'],
        },

        // Method combinations
        {
          selector: 'classMethod',
          modifiers: ['private', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classMethod',
          modifiers: ['protected', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classMethod',
          modifiers: ['public', 'static'],
          format: ['camelCase'],
        },
        {
          selector: 'classMethod',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classMethod',
          modifiers: ['protected'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'classMethod',
          modifiers: ['public'],
          format: ['camelCase'],
        },
        {
          selector: 'classMethod',
          modifiers: ['static'],
          format: ['camelCase'],
        },
        {
          selector: 'classMethod',
          format: ['camelCase'],
        },

        // Accessors
        {
          selector: 'accessor',
          modifiers: ['private', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'accessor',
          modifiers: ['protected', 'static'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'accessor',
          modifiers: ['public', 'static'],
          format: ['camelCase'],
        },
        {
          selector: 'accessor',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'accessor',
          modifiers: ['protected'],
          format: ['camelCase'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'accessor',
          modifiers: ['public'],
          format: ['camelCase'],
        },
        {
          selector: 'accessor',
          modifiers: ['static'],
          format: ['camelCase'],
        },
        {
          selector: 'accessor',
          format: ['camelCase'],
        },

        // Interface/Type members
        {
          selector: 'typeProperty',
          format: ['camelCase'],
        },
        {
          selector: 'typeMethod',
          format: ['camelCase'],
        },

        // Object literal members
        {
          selector: 'objectLiteralProperty',
          format: ['camelCase'],
        },
        {
          selector: 'objectLiteralMethod',
          format: ['camelCase'],
        },

        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },

        // Quoted members (keep at end)
        {
          selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty', 'typeMethod'],
          format: null,
          modifiers: ['requiresQuotes'],
        },
      ],
    },
  },

  skipFormatting
)
