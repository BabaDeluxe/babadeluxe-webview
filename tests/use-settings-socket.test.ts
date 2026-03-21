/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, test } from 'vitest'
import type { Root } from '@babadeluxe/shared'
import { nextTick } from 'vue'
import { useSettingsSocket } from '@/composables/use-settings-socket'
import * as emitWithTimeoutModule from '@/emit-with-timeout'
import { mountComposable } from './helpers/mount-composable'
import type { MockSocket } from './helpers/mock-socket-manager'
import {
  createMockSocketManager,
  trigger as triggerSocketEvent,
} from './helpers/mock-socket-manager'
import type { Result } from 'neverthrow'
import { ok } from 'neverthrow'

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
          minValue: 1,
        }
      }
      // Fallback to real behavior
      return actual.getSettingDefinition?.(key)
    },
  }
})

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

let settingsSocket: MockSettingsSocket

function trigger<T extends keyof Root.Emission>(
  event: T,
  payload: Parameters<Root.Emission[T]>[0]
): Promise<void> {
  return triggerSocketEvent(settingsSocket, event as string, payload)
}

function mockGetAllEmit(response: unknown): void {
  vi.spyOn(emitWithTimeoutModule, 'emitWithTimeout').mockResolvedValue(
    ok(response) as Result<unknown, Error | string>
  )
}

function mockUpsertEmit(): void {
  vi.spyOn(emitWithTimeoutModule, 'emitWithTimeout').mockResolvedValue(
    ok(undefined) as Result<unknown, Error | string>
  )
}

describe('useSettingsSocket()', () => {
  function mountSettingsSocket() {
    const { socketManager, global } = createMockSocketManager()
    settingsSocket = socketManager.settingsSocket as MockSettingsSocket

    return mountComposable(() => useSettingsSocket(), {
      global,
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

      const { settings, loadSettings, isLoading } = mountSettingsSocket()

      const loadResult = await loadSettings()
      if (loadResult.isErr()) return

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
        mockUpsertEmit()

        const { upsertSetting } = mountSettingsSocket()

        const result = await upsertSetting(key, value, dataType)
        expect(result.isOk()).toBe(true)
      }
    )
  })
})
