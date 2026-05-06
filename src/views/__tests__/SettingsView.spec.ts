import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly, computed } from 'vue'
import type { AsyncInjectable } from '@/injection-keys'
import {
  API_KEY_VALIDATOR_KEY,
  LOGGER_KEY,
  SUPABASE_CLIENT_KEY,
} from '@/injection-keys'
import type { IApiKeyValidator } from '@/api-key-validator'
import SettingsView from '@/views/SettingsView.vue'

// Stub heavy composable deps — we only test the loading-state gate here
vi.mock('@/composables/use-settings', () => ({
  useSettings: () => ({
    settings: ref([]),
    upsertSetting: vi.fn(),
    loadSettings: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/composables/use-models-socket', () => ({
  useModelsSocket: () => ({ reloadModels: vi.fn() }),
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

const makeMockValidator = (): IApiKeyValidator => ({
  validate: vi.fn(),
})

const makeInjectable = (
  isReady: boolean,
  hasError: boolean,
  validator?: IApiKeyValidator
): AsyncInjectable<IApiKeyValidator> => ({
  isReady: readonly(ref(isReady)),
  hasError: readonly(ref(hasError)),
  value: readonly(ref(validator)),
})

const makeLogger = () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const makeSupabase = () => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
})

const mountSettings = (injectable: AsyncInjectable<IApiKeyValidator>) =>
  mount(SettingsView, {
    global: {
      provide: {
        [API_KEY_VALIDATOR_KEY as symbol]: injectable,
        [LOGGER_KEY as symbol]: makeLogger(),
        [SUPABASE_CLIENT_KEY as symbol]: makeSupabase(),
      },
      stubs: {
        BaseSpinner: { template: '<div data-testid="base-spinner" />' },
        BaseButton: { template: '<button data-testid="base-button"><slot /></button>' },
        BaseInput: { template: '<input data-testid="base-input" />' },
        SettingsField: { template: '<div data-testid="settings-field" />' },
      },
    },
  })

describe('SettingsView — AsyncInjectable gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render spinner while isReady is false', () => {
    const wrapper = mountSettings(makeInjectable(false, false))

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="component-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-container"] > template').exists()).toBe(false)
  })

  it('should render error state when hasError is true', () => {
    const wrapper = mountSettings(makeInjectable(false, true))

    expect(wrapper.find('[data-testid="component-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(false)
  })

  it('should render settings content when isReady is true', async () => {
    const wrapper = mountSettings(makeInjectable(true, false, makeMockValidator()))

    // Wait for onMounted loadSettings to resolve
    await vi.runAllTimersAsync().catch(() => undefined)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="loading-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="component-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="appearance-section"]').exists()).toBe(true)
  })

  it('should not call validate before isReady is true', () => {
    const validator = makeMockValidator()
    mountSettings(makeInjectable(false, false, validator))

    expect(validator.validate).not.toHaveBeenCalled()
  })
})
