import { createApp, type App } from 'vue'

/**
 * Runs a composable inside a real Vue app lifecycle so inject/provide and
 * onMounted/onBeforeUnmount hooks work correctly in unit tests.
 */
export function withSetup<T>(composable: () => T): { result: T; app: App } {
  let result!: T

  const app = createApp({
    setup() {
      result = composable()
      return () => null
    },
  })

  app.mount(document.createElement('div'))

  return { result, app }
}
