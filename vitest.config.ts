import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import viteConfig from './vite.config'

const myExport = (context: { mode: string }) => {
  const mode = context.mode || process.env.NODE_ENV || 'development'
  const mergedConfig = mergeConfig(
    viteConfig,
    defineConfig({
      test: {
        env: {
          ...loadEnv(mode, process.cwd(), ''),

          NODE_ENV: 'test', // Explicitly set for Vitest
        },
        environment: 'node',
        exclude: [...configDefaults.exclude, '**/e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
        setupFiles: ['./tests/setup.ts'],
        globals: true,
      },
    })
  )
  return mergedConfig
}

export default myExport
