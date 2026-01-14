/**
 * @vitest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import type { ConsoleLogger } from '@simwai/utils'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { LOGGER_KEY } from '@/injection-keys'
import { ok } from 'neverthrow'

function createKeyValueStoreMock() {
  return {
    get: vi.fn().mockResolvedValue(ok({ value: 50 })),
    set: vi.fn(),
  }
}

describe('useResizableSplit', () => {
  let keyValueStore: any
  let logger: any

  const baseOptions = {
    storageKey: 'split-test',
    refKey: 'container',
    defaultRatio: 40,
    minRatio: 20,
    maxRatio: 80,
    direction: 'horizontal' as const,
  }

  function mountSplit(storeOverride?: any) {
    keyValueStore = storeOverride ?? createKeyValueStoreMock()
    logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as ConsoleLogger

    let api: ReturnType<typeof useResizableSplit> | undefined

    const component = defineComponent({
      setup() {
        api = useResizableSplit({
          ...baseOptions,
          keyValueStore,
        })
        return () => h('div')
      },
    })

    mount(component, {
      global: {
        provide: {
          [LOGGER_KEY as symbol]: logger,
        },
      },
    })

    return api!
  }

  it('loads valid stored ratio', async () => {
    const store = createKeyValueStoreMock()

    const { leftWidth } = mountSplit(store)

    expect(leftWidth.value).toBeTypeOf('number')
  })
})
