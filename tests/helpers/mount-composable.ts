import { defineComponent, h } from 'vue'
import { type ComponentMountingOptions, mount } from '@vue/test-utils'
import { LOGGER_KEY } from '@/injection-keys'
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
        [LOGGER_KEY as symbol]: mockLogger,
      },
    },
  }

  mount(component, mergedOptions)
  return composableReturn!
}
