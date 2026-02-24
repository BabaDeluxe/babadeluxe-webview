/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi, test } from 'vitest'
import type { Root } from '@babadeluxe/shared'
import { ref } from 'vue'
import { useSettingsSocket } from '@/composables/use-settings-socket'
import { SOCKET_MANAGER_KEY } from '@/injection-keys'
import { mountComposable } from './helpers/mount-composable'
import { MockSocket, trigger as triggerSocketEvent } from './helpers/mock-socket-manager'

export type MockSettingsSocket = MockSocket

const fixtures = {
  settings: {
    openaiKey: {
      settingKey: 'OPENAI_API_KEY',
      settingValue: 'sk-abc123',
      dataType: 'string' as const,
      updatedAt: new Date('2026-02-07T15:00:00Z').toISOString(),
    },
    anthropicKey: {
      settingKey: 'ANTHROPIC_API_KEY',
      settingValue: 'sk-ant-xyz789',
      dataType: 'string' as const,
      updatedAt: new Date('2026-02-07T15:00:00Z').toISOString(),
    },
    maxTokens: {
      settingKey: 'MAX_TOKENS',
      settingValue: '4096',
      dataType: 'number' as const,
      updatedAt: new Date('2026-02-07T15:00:00Z').toISOString(),
    },
  },
  responses: {
    success: (data?: unknown) => ({ success: true as const, data }),
    error: (error?: string) => ({
      success: false as const,
      error: error ?? 'Unknown error',
    }),
  },
}

function createMockSettingsSocket(): MockSettingsSocket {
  return new MockSocket()
}

function trigger<T extends keyof Root.Emission>(
  socket: MockSettingsSocket,
  event: T,
  payload: Parameters<Root.Emission[T]>[0]
): void {
  triggerSocketEvent(socket, event as string, payload)
}

function mockGetAllEmit(socket: MockSettingsSocket, response: unknown): void {
  socket.emit = vi.fn((event: string, ...args: unknown[]) => {
    if (event === 'settings:getAll' && typeof args[0] === 'function') {
      const callback = args[0] as (resp: unknown) => void
      callback(response)
    }
    return {
      isOk: () => true,
      isErr: () => false,
    }
  })
}

function mockUpsertEmit(socket: MockSettingsSocket, response: unknown): void {
  socket.emit = vi.fn((event: string, ...args: unknown[]) => {
    if (event === 'settings:upsert' && typeof args[1] === 'function') {
      const callback = args[1] as (resp: unknown) => void
      callback(response)
    }
    return {
      isOk: () => true,
      isErr: () => false,
    }
  })
}

describe('useSettingsSocket()', () => {
  let settingsSocket: MockSettingsSocket

  function mountSettingsSocket() {
    return mountComposable(() => useSettingsSocket(), {
      global: {
        provide: {
          [SOCKET_MANAGER_KEY as symbol]: ref({ settingsSocket }),
        },
      },
    })
  }

  beforeEach(() => {
    settingsSocket = createMockSettingsSocket()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('real-time settings synchronization', () => {
    it('adds new setting on settings:updated event', () => {
      const { settings } = mountSettingsSocket()

      trigger(settingsSocket, 'settings:updated', fixtures.settings.openaiKey)

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0]).toEqual(
        expect.objectContaining({
          settingKey: 'OPENAI_API_KEY',
          settingValue: 'sk-abc123',
          dataType: 'string',
        })
      )
    })

    it('updates existing setting on settings:updated event', () => {
      const { settings } = mountSettingsSocket()

      trigger(settingsSocket, 'settings:updated', fixtures.settings.openaiKey)
      trigger(settingsSocket, 'settings:updated', {
        ...fixtures.settings.openaiKey,
        settingValue: 'sk-new-key',
      })

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0]).toEqual(
        expect.objectContaining({
          settingKey: 'OPENAI_API_KEY',
          settingValue: 'sk-new-key',
        })
      )
    })

    it('removes setting on settings:deleted event', () => {
      const { settings } = mountSettingsSocket()

      trigger(settingsSocket, 'settings:updated', fixtures.settings.openaiKey)
      trigger(settingsSocket, 'settings:updated', fixtures.settings.anthropicKey)
      expect(settings.value).toHaveLength(2)

      trigger(settingsSocket, 'settings:deleted', { settingKey: 'OPENAI_API_KEY' })

      expect(settings.value).toHaveLength(1)
      expect(settings.value[0].settingKey).toBe('ANTHROPIC_API_KEY')
    })

    it('surfaces server errors', () => {
      const { error } = mountSettingsSocket()

      trigger(settingsSocket, 'settings:error', { error: 'Database connection failed' })

      expect(error.value).toBe('Database connection failed')
    })
  })

  describe('loadSettings', () => {
    it('loads all settings on success', async () => {
      mockGetAllEmit(
        settingsSocket,
        fixtures.responses.success([
          fixtures.settings.openaiKey,
          fixtures.settings.anthropicKey,
          fixtures.settings.maxTokens,
        ])
      )

      const { settings, loadSettings, isLoading } = mountSettingsSocket()

      await loadSettings()

      expect(isLoading.value).toBe(false)
      expect(settings.value).toHaveLength(3)
      expect(settings.value).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ settingKey: 'OPENAI_API_KEY' }),
          expect.objectContaining({ settingKey: 'ANTHROPIC_API_KEY' }),
          expect.objectContaining({ settingKey: 'MAX_TOKENS' }),
        ])
      )
    })
  })

  describe('upsertSetting', () => {
    const upsertCases = [
      {
        name: 'string setting',
        key: 'OPENAI_API_KEY',
        value: 'sk-new',
        dataType: 'string' as const,
      },
      {
        name: 'number setting',
        key: 'MAX_TOKENS',
        value: 8192,
        dataType: 'number' as const,
      },
      {
        name: 'boolean setting',
        key: 'ENABLE_STREAMING',
        value: true,
        dataType: 'boolean' as const,
      },
    ]

    test.each(upsertCases)(
      'resolves on successful upsert: $name',
      async ({ key, value, dataType }) => {
        mockUpsertEmit(settingsSocket, fixtures.responses.success())

        const { upsertSetting } = mountSettingsSocket()

        const result = await upsertSetting(key, value, dataType)
        expect(result.isOk()).toBe(true)
      }
    )
  })
})
