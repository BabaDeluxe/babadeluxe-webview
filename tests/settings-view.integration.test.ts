/** @vitest-environment jsdom */
/**
 * Integration test: SettingsView + AsyncInjectable reactive state.
 *
 * Litmus: Multiple parts work together (real reactive provide/inject tree +
 * component render + DOM state transitions). No real server or DB needed —
 * AsyncInjectable is an in-memory reactive object.
 *
 * Asserts only observable DOM behaviour (what the user sees), never internals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ref, readonly } from 'vue'
import type { AsyncInjectable } from '@/injection-keys'
import { API_KEY_VALIDATOR_KEY, LOGGER_KEY, SUPABASE_CLIENT_KEY } from '@/injection-keys'
import type { IApiKeyValidator } from '@/api-key-validator'
import SettingsView from '@/views/SettingsView.vue'

import { ok } from 'neverthrow'
vi.mock('@/composables/use-settings', () => ({
  useSettings: () => ({
    settings: ref([]),
    upsertSetting: vi.fn().mockResolvedValue(ok(undefined)),
    loadSettings: vi.fn().mockResolvedValue(ok(undefined)),
  }),
}))

vi.mock('@/composables/use-models-socket', () => ({
  useModelsSocket: () => ({
    models: ref({}),
    reloadModels: vi.fn().mockResolvedValue(ok(undefined)),
  }),
}))

vi.mock('@/composables/use-theme', () => ({
  useTheme: () => ({ isDark: ref(false), toggleDark: vi.fn() }),
}))

vi.mock('@/stores/use-toast-store', () => ({
  useToastStore: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
}))

vi.mock('@/env-validator', () => ({
  isOfflineMode: () => true,
}))

const makeValidator = (): IApiKeyValidator => ({ validate: vi.fn() })

const mountWithInjectable = (injectable: AsyncInjectable<IApiKeyValidator>): VueWrapper =>
  mount(SettingsView, {
    global: {
      provide: {
        [API_KEY_VALIDATOR_KEY as symbol]: injectable,
        [LOGGER_KEY as symbol]: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        [SUPABASE_CLIENT_KEY as symbol]: {
          auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
          },
        },
      },
      stubs: {
        /* eslint-disable @typescript-eslint/naming-convention */
        BaseSpinner: { template: '<div data-testid="base-spinner" />' },
        BaseButton: { template: '<button data-testid="base-button"><slot /></button>' },
        BaseInput: { template: '<input data-testid="base-input" />' },
        SettingsField: { template: '<div data-testid="settings-field" />' },
        /* eslint-enable @typescript-eslint/naming-convention */
      },
    },
  })

describe('SettingsView — AsyncInjectable loading states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows spinner while validator is not yet ready', () => {
    const injectable: AsyncInjectable<IApiKeyValidator> = {
      isReady: readonly(ref(false)),
      hasError: readonly(ref(false)),
      value: readonly(ref(undefined)),
    }

    const wrapper = mountWithInjectable(injectable)

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="component-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="appearance-section"]').exists()).toBe(false)
  })

  it('shows error UI when socket init failed', () => {
    const injectable: AsyncInjectable<IApiKeyValidator> = {
      isReady: readonly(ref(false)),
      hasError: readonly(ref(true)),
      value: readonly(ref(undefined)),
    }

    const wrapper = mountWithInjectable(injectable)

    expect(wrapper.find('[data-testid="component-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(false)
  })

  it('shows settings content once validator is ready', async () => {
    const injectable: AsyncInjectable<IApiKeyValidator> = {
      isReady: readonly(ref(true)),
      hasError: readonly(ref(false)),
      value: readonly(ref(makeValidator())),
    }

    const wrapper = mountWithInjectable(injectable)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="component-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="appearance-section"]').exists()).toBe(true)
  })

  it('transitions from spinner to content when isReady becomes true', async () => {
    const isReady = ref(false)
    const injectable: AsyncInjectable<IApiKeyValidator> = {
      isReady: readonly(isReady),
      hasError: readonly(ref(false)),
      value: readonly(ref(makeValidator())),
    }

    const wrapper = mountWithInjectable(injectable)
    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)

    isReady.value = true
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="appearance-section"]').exists()).toBe(true)
  })
})
