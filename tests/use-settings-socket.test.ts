/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSettings } from '@/composables/use-settings'
import * as emitWithTimeoutModule from '@/emit-with-timeout'
import { mountComposable } from './helpers/mount-composable'
import type { MockSocket, MockSettingsSocket } from './helpers/mock-socket-manager'
import {
  createMockSocketManager,
  trigger as triggerSocketEvent,
} from './helpers/mock-socket-manager'
import { ok } from 'neverthrow'
import { APP_DB_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'

vi.mock('@/env-validator', () => ({
  isOfflineMode: vi.fn().mockReturnValue(false),
  validateEnvConfig: vi.fn().mockReturnValue({ isOk: () => true, isErr: () => false, value: {} }),
}))

const fixtures = {
  settings: {
    openaiKey: {
      settingKey: 'OPENAI_API_KEY',
      settingValue: 'sk-abc123',
      dataType: 'string',
      updatedAt: new Date().toISOString(),
    },
    anthropicKey: {
      settingKey: 'ANTHROPIC_API_KEY',
      settingValue: 'sk-ant456',
      dataType: 'string',
      updatedAt: new Date().toISOString(),
    },
  },
}

let settingsSocket: MockSocket

async function trigger(event: string, payload: unknown) {
  await triggerSocketEvent(settingsSocket, event, payload)
}

const mockDb = {
  localSetting: {
    toArray: vi.fn().mockResolvedValue({ isErr: () => false, value: [] }),
    where: vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ isErr: () => false, value: undefined }),
      }),
    }),
  },
}

describe('useSettings()', () => {
  function mountSettingsSocket() {
    const { socketManagerRef, socket } = createMockSocketManager({ appDb: mockDb })
    settingsSocket = socket as MockSettingsSocket

    return mountComposable(() => useSettings(), {
      global: {
        provide: {
          [SOCKET_MANAGER_KEY as symbol]: socketManagerRef,
          [APP_DB_KEY as symbol]: mockDb,
        },
      },
    })
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('real-time settings synchronization', () => {
    it('adds new setting on settings:updated event', async () => {
      const { settings } = mountSettingsSocket()
      await nextTick()

      await trigger('settings:updated', fixtures.settings.openaiKey)

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0]).toEqual(
        expect.objectContaining({
          settingKey: 'OPENAI_API_KEY',
          settingValue: 'sk-abc123',
          dataType: 'string',
        })
      )
    })

    it('updates existing setting on settings:updated event', async () => {
      const { settings } = mountSettingsSocket()
      await nextTick()
      await trigger('settings:updated', fixtures.settings.openaiKey)
      const updated = { ...fixtures.settings.openaiKey, settingValue: 'sk-new' }
      await trigger('settings:updated', updated)

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0]).toEqual(
        expect.objectContaining({
          settingValue: 'sk-new',
        })
      )
    })

    it('removes setting on settings:deleted event', async () => {
      const { settings } = mountSettingsSocket()
      await nextTick()

      await trigger('settings:updated', fixtures.settings.openaiKey)
      await trigger('settings:updated', fixtures.settings.anthropicKey)

      expect(settings.value).toHaveLength(2)

      await trigger('settings:deleted', { settingKey: 'OPENAI_API_KEY' })

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0].settingKey).toBe('ANTHROPIC_API_KEY')
    })

    it('surfaces server errors', async () => {
      const { error } = mountSettingsSocket()
      await nextTick()

      await trigger('settings:error', { error: 'Database connection failed' })

      expect(error.value).toMatch(/database/i)
      expect(error.value).toMatch(/failed/i)
    })
  })

  describe('loadSettings', () => {
    it('loads all settings on success', async () => {
      vi.spyOn(emitWithTimeoutModule, 'emitWithTimeout').mockResolvedValue(
        ok({
          success: true,
          data: [fixtures.settings.openaiKey],
        })
      )

      const { loadSettings, settings } = mountSettingsSocket()
      await loadSettings()

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0].settingKey).toBe('OPENAI_API_KEY')
    })
  })

  describe('upsertSetting', () => {
    it('resolves on successful upsert', async () => {
      vi.spyOn(emitWithTimeoutModule, 'emitWithTimeout').mockResolvedValue(ok({ success: true }))

      const { upsertSetting } = mountSettingsSocket()
      const result = await upsertSetting('KEY', 'VAL', 'string')

      expect(result.isOk()).toBe(true)
    })
  })
})
