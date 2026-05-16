/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, test } from 'vitest'
import type { Root } from '@babadeluxe/shared'
import { nextTick, ref } from 'vue'
import { useSettings } from '@/composables/use-settings'
import * as emitWithTimeoutModule from '@/emit-with-timeout'
import { mountComposable } from './helpers/mount-composable'
import type { MockSocket, MockSettingsSocket } from './helpers/mock-socket-manager'
import {
  createMockSocketManager,
  trigger as triggerSocketEvent,
} from './helpers/mock-socket-manager'
import type { Result } from 'neverthrow'
import { ok } from 'neverthrow'
import { APP_DB_KEY } from '@/injection-keys'

vi.mock('@/env-validator', async (orig) => {
  const actual = await orig<any>()
  return {
    ...actual,
    isOfflineMode: () => false,
  }
})

vi.mock('@babadeluxe/shared', async (origImport) => {
  const actual = await origImport<{
    getSettingDefinition: (key: string) => unknown
  }>()

  return {
    ...actual,
    getSettingDefinition: (key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return {
          category: 'apiKey',
          encrypted: true,
          dataType: 'string' as const,
          required: false,
          description: 'OpenAI API key',
        }
      }
      if (key === 'ANTHROPIC_API_KEY') {
        return {
          category: 'apiKey',
          encrypted: true,
          dataType: 'string' as const,
          required: false,
          description: 'Anthropic API key',
        }
      }
      if (key === 'MAX_TOKENS') {
        return {
          category: 'llm',
          encrypted: false,
          dataType: 'number' as const,
          required: false,
          description: 'Max tokens',
        }
      }
      return undefined
    },
  }
})

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
    maxTokens: {
      settingKey: 'MAX_TOKENS',
      settingValue: 2048,
      dataType: 'number',
      updatedAt: new Date().toISOString(),
    },
  },
  responses: {
    success: (data?: unknown) => ({ success: true as const, data: data ?? [] }),
    error: (error?: string) => ({
      success: false as const,
      error: error ?? 'Unknown error',
    }),
  },
}

let settingsSocket: MockSettingsSocket

function trigger<T extends keyof Root.Emission>(
  event: T,
  payload: Parameters<Root.Emission[T]>[0]
): Promise<void> {
  return triggerSocketEvent(settingsSocket, event as string, payload)
}

function mockGetAllEmit(response: unknown): void {
  vi.spyOn(emitWithTimeoutModule, 'emitWithTimeout').mockResolvedValue(
    ok((response as any).data) as Result<unknown, Error | string>
  )
}

function mockUpsertEmit(): void {
  vi.spyOn(emitWithTimeoutModule, 'emitWithTimeout').mockResolvedValue(
    ok(undefined) as Result<unknown, Error | string>
  )
}

const mockDb = {
  localSetting: {
    where: vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(ok(undefined)),
      }),
    }),
    toArray: vi.fn().mockResolvedValue(ok([])),
    add: vi.fn().mockResolvedValue(ok(1)),
    update: vi.fn().mockResolvedValue(ok(1)),
    delete: vi.fn().mockResolvedValue(ok(1)),
  },
}

describe('useSettings()', () => {
  function mountSettingsSocket() {
    const { socketManager, global } = createMockSocketManager()
    settingsSocket = socketManager.settingsSocket as MockSettingsSocket

    return mountComposable(() => useSettings(), {
      global: {
        ...global,
        provide: {
          ...global.provide,
          [APP_DB_KEY as symbol]: mockDb, // Mock DB even if not offline
        }
      }
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
      await trigger('settings:updated', {
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
      mockGetAllEmit(
        fixtures.responses.success([
          fixtures.settings.openaiKey,
          fixtures.settings.anthropicKey,
          fixtures.settings.maxTokens,
        ])
      )

      const { settings, isLoading, loadSettings } = mountSettingsSocket()
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
    test.each([
      ['string setting', 'OPENAI_API_KEY', 'sk-new-key', 'string'],
      ['number setting', 'MAX_TOKENS', 4096, 'number'],
      ['boolean setting', 'OFFLINE_MODE', true, 'boolean'],
    ])('resolves on successful upsert: %s', async (_, key, value, type) => {
      mockUpsertEmit()
      const { upsertSetting } = mountSettingsSocket()

      const result = await upsertSetting(key, value, type as 'string' | 'number' | 'boolean')
      expect(result.isOk()).toBe(true)
    })
  })
})
