import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

export function mountComposable<T>(useFn: () => T, options?: unknown): T {
  let composableReturn: T

  const component = defineComponent({
    setup() {
      composableReturn = useFn()
      return () => h('div')
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mount(component, options as any)
  return composableReturn!
}
