import { defineComponent, h } from 'vue'
import { type ComponentMountingOptions, mount } from '@vue/test-utils'
import { loggerKey } from '@/injection-keys'
import { mockLogger } from './mock-logger'

export function mountComposable<T>(
  useFn: () => T,
  options?: ComponentMountingOptions<Record<string, unknown>>
): T {
  let composableReturn: T

  const component = defineComponent({
    setup() {
      composableReturn = useFn()
      return () => h('div')
    },
  })

  const mergedOptions: ComponentMountingOptions<Record<string, unknown>> = {
    ...options,
    global: {
      ...options?.global,
      provide: {
        ...options?.global?.provide,
        [loggerKey as symbol]: mockLogger,
      },
    },
  }

  mount(component, mergedOptions)
  return composableReturn!
}
