/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Root } from '@babadeluxe/shared'
import type { ConsoleLogger } from '@simwai/utils'
import { useSettingsSocket } from '@/composables/use-settings-socket'
import { LOGGER_KEY, SOCKET_MANAGER_KEY } from '@/injection-keys'
import { mountComposable } from './helpers/mount-composable'

type SettingsHandler = (payload: unknown) => void
type HandlerMap = Record<string, SettingsHandler[]>

interface MockSettingsSocket {
  isConnected: boolean
  on: (event: string, handler: SettingsHandler) => void
  off: (event: string, handler: SettingsHandler) => void
  emit: (event: string, ...args: unknown[]) => void
  waitForConnection: () => Promise<{ isErr: () => boolean; error?: Error }>
  handlers: HandlerMap
}

// Test fixtures
const fixtures = {
  setting: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    OPENAI_API_KEY: {
      settingKey: 'OPENAI_API_KEY',
      settingValue: 'abc',
      dataType: 'string' as const,
      updatedAt: new Date().toISOString(),
    },
    settingA: {
      settingKey: 'A',
      settingValue: '1',
      dataType: 'string' as const,
      updatedAt: new Date().toISOString(),
    },
    settingB: {
      settingKey: 'B',
      settingValue: '2',
      dataType: 'string' as const,
      updatedAt: new Date().toISOString(),
    },
  },
  response: {
    success: (data?: unknown) => ({ success: true as const, data }),
    error: (error: string) => ({ success: false as const, error }),
  },
}

function createMockSocket(): MockSettingsSocket {
  const handlers: HandlerMap = {}

  return {
    isConnected: true,
    on: vi.fn((event: string, handler: SettingsHandler) => {
      handlers[event] = handlers[event] || []
      handlers[event]!.push(handler)
    }),
    off: vi.fn((event: string, handler: SettingsHandler) => {
      handlers[event] = (handlers[event] || []).filter((h) => h !== handler)
    }),
    emit: vi.fn(),
    waitForConnection: vi.fn().mockResolvedValue({ isErr: () => false }),
    handlers,
  }
}

function createMockLogger(): ConsoleLogger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ConsoleLogger
}

function trigger<T extends keyof Root.Emission>(
  socket: MockSettingsSocket,
  event: T,
  payload: Parameters<Root.Emission[T]>[0]
) {
  for (const handler of socket.handlers[event as string] || []) {
    handler(payload)
  }
}

describe('useSettingsSocket', () => {
  let settingsSocket: MockSettingsSocket
  let logger: ConsoleLogger
  let composable: ReturnType<typeof useSettingsSocket>

  function mountComposableWithMocks() {
    return mountComposable(() => useSettingsSocket(), {
      global: {
        provide: {
          [SOCKET_MANAGER_KEY as symbol]: { settingsSocket },
          [LOGGER_KEY as symbol]: logger,
        },
      },
    })
  }

  beforeEach(() => {
    settingsSocket = createMockSocket()
    logger = createMockLogger()
    composable = mountComposableWithMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Event Handlers', () => {
    it('adds new setting on settings:updated', () => {
      trigger(settingsSocket, 'settings:updated', fixtures.setting.OPENAI_API_KEY)

      expect(composable.settings.value).toHaveLength(1)
      expect(composable.settings.value[0].settingKey).toBe('OPENAI_API_KEY')
    })

    it('updates existing setting on settings:updated', () => {
      const setting = fixtures.setting.OPENAI_API_KEY

      trigger(settingsSocket, 'settings:updated', setting)
      trigger(settingsSocket, 'settings:updated', { ...setting, settingValue: 'xyz' })

      expect(composable.settings.value).toHaveLength(1)
      expect(composable.settings.value[0].settingValue).toBe('xyz')
    })

    it('removes setting on settings:deleted', () => {
      trigger(settingsSocket, 'settings:updated', fixtures.setting.settingA)
      trigger(settingsSocket, 'settings:updated', fixtures.setting.settingB)

      expect(composable.settings.value).toHaveLength(2)

      trigger(settingsSocket, 'settings:deleted', { settingKey: 'A' })

      expect(composable.settings.value).toHaveLength(1)
      expect(composable.settings.value[0].settingKey).toBe('B')
    })

    it('sets error on settings:error', () => {
      trigger(settingsSocket, 'settings:error', { error: 'boom' })

      expect(composable.error.value).toBe('boom')
      expect(logger.error).toHaveBeenCalledWith('Settings socket error:', 'boom')
    })
  })

  describe('loadSettings', () => {
    function mockEmitResponse(response: unknown) {
      settingsSocket.emit = vi.fn().mockImplementation((event: string, ...args: unknown[]) => {
        if (event === 'settings:getAll') {
          const cb = args[0] as (response: unknown) => void
          cb(response)
        }
      })
    }

    it('fills settings on success', async () => {
      mockEmitResponse(
        fixtures.response.success([
          {
            settingKey: 'OPENAI_API_KEY',
            settingValue: 'abc',
            dataType: 'string',
            updatedAt: new Date().toISOString(),
          },
        ])
      )

      await composable.loadSettings()

      expect(composable.isLoading.value).toBe(false)
      expect(composable.error.value).toBeUndefined()
      expect(composable.settings.value).toHaveLength(1)
      expect(composable.settings.value[0].settingKey).toBe('OPENAI_API_KEY')
    })

    it('sets error on backend failure', async () => {
      mockEmitResponse(fixtures.response.error('fail'))

      await expect(composable.loadSettings()).rejects.toThrow('fail')
      expect(composable.error.value).toBe('fail')
    })
  })

  describe('upsertSetting', () => {
    function mockEmitResponse(response: unknown) {
      settingsSocket.emit = vi.fn().mockImplementation((event: string, ...args: unknown[]) => {
        if (event === 'settings:upsert') {
          const cb = args[1] as (response: unknown) => void
          cb(response)
        }
      })
    }

    it('resolves on success', async () => {
      mockEmitResponse(fixtures.response.success())

      await expect(
        composable.upsertSetting('OPENAI_API_KEY', 'abc', 'string')
      ).resolves.toBeUndefined()
    })

    it('rejects and sets error on failure', async () => {
      mockEmitResponse(fixtures.response.error('bad'))

      await expect(composable.upsertSetting('OPENAI_API_KEY', 'abc', 'string')).rejects.toThrow(
        'bad'
      )
      expect(composable.error.value).toBe('bad')
    })
  })
})
