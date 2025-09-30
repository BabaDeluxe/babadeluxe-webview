import sharedConfig from '@babadeluxe/xo-config'
import vueParser from 'vue-eslint-parser'
import tsEslintParser from '@typescript-eslint/parser'
import pluginVue from 'eslint-plugin-vue'

const baseConfig = sharedConfig
const configArray = Array.isArray(baseConfig) ? baseConfig : [baseConfig]

const vueRules = {
  // Vue essential rules
  'vue/no-unused-vars': 'error',
  'vue/no-unused-components': 'error',
  'vue/no-parsing-error': 'error',
  'vue/valid-template-root': 'error',
  'vue/valid-v-bind': 'error',
  'vue/valid-v-cloak': 'error',
  'vue/valid-v-else-if': 'error',
  'vue/valid-v-else': 'error',
  'vue/valid-v-for': 'error',
  'vue/valid-v-html': 'error',
  'vue/valid-v-if': 'error',
  'vue/valid-v-model': 'error',
  'vue/valid-v-on': 'error',
  'vue/valid-v-once': 'error',
  'vue/valid-v-pre': 'error',
  'vue/valid-v-show': 'error',
  'vue/valid-v-text': 'error',

  // Vue strongly recommended rules
  'vue/attribute-hyphenation': 'warn',
  'vue/component-definition-name-casing': 'warn',
  'vue/first-attribute-linebreak': 'warn',
  'vue/html-closing-bracket-newline': 'warn',
  'vue/html-closing-bracket-spacing': 'warn',
  'vue/html-end-tags': 'warn',
  'vue/html-indent': 'warn',
  'vue/html-quotes': 'warn',
  'vue/html-self-closing': 'warn',
  'vue/max-attributes-per-line': 'warn',
  'vue/multiline-html-element-content-newline': 'warn',
  'vue/mustache-interpolation-spacing': 'warn',
  'vue/no-multi-spaces': 'warn',
  'vue/no-spaces-around-equal-signs-in-attribute': 'warn',
  'vue/no-template-shadow': 'warn',
  'vue/one-component-per-file': 'warn',
  'vue/prop-name-casing': 'warn',
  'vue/require-default-prop': 'warn',
  'vue/require-explicit-emits': 'warn',
  'vue/require-prop-types': 'warn',
  'vue/singleline-html-element-content-newline': 'warn',
  'vue/v-bind-style': 'warn',
  'vue/v-on-event-hyphenation': ['warn', 'always', { autofix: true }],
  'vue/v-on-style': 'warn',
  'vue/v-slot-style': 'warn',
}

const config: any = [
  ...configArray,
  {
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/node_modules/**'],
  },
  {
    files: ['**/*.vue'],
    plugins: {
      vue: pluginVue,
    },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsEslintParser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    rules: {
      ...vueRules,
      'import-x/extensions': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/prefer-string-replace-all': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsEslintParser,
    },
    rules: {
      'import-x/extensions': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/prefer-string-replace-all': 'off',
    },
  },
]

export default config
