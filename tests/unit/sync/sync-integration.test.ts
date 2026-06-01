import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncManager } from '@/sync/sync-manager'
import { WebDavProviderDriver } from '@/sync/webdav-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { ok } from 'neverthrow'
import type { AppDb } from '@/database/app-db'
import type { AbstractLogger } from '@/logger'

describe('Sync Integration', () => {
  let db: unknown
  let driver: WebDavProviderDriver
  let service: ShardedSyncService
  let manager: SyncManager
  let logger: unknown

  beforeEach(() => {
    db = {
      conversation: {
        get: vi
          .fn()
          .mockResolvedValue(ok({ id: 1, title: 'Local', syncId: 'webdav:1', syncVersion: 1 })),
        put: vi.fn().mockResolvedValue(ok(1)),
        delete: vi.fn().mockResolvedValue(ok(undefined)),
        update: vi.fn().mockResolvedValue(ok(undefined)),
      },
      message: {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(ok([])),
          }),
        }),
        bulkDelete: vi.fn().mockResolvedValue(ok(undefined)),
        bulkPut: vi.fn().mockResolvedValue(ok(undefined)),
      },
    }

    logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('shard_map.json'))
          return {
            ok: true,
            status: 200,
            json: async () => ({
              n: 1,
              shards: [{ index: 0, url: 'https://dav.com/', readOnly: false }],
            }),
            text: async () => '',
          }
        if (url.includes('.sync_metadata.json'))
          return {
            ok: true,
            status: 200,
            json: async () => ({
              keys: {
                '1': {
                  path: 'keys/1.000.md',
                  sha256: 'fake',
                  ts: Date.now(),
                  parts: ['keys/1.000.md'],
                },
              },
            }),
            text: async () => '',
          }
        if (url.includes('keys/1.000.md')) {
          const content = btoa(
            unescape(
              encodeURIComponent(
                JSON.stringify({
                  id: 1,
                  syncVersion: 2,
                  conversation: {
                    id: 1,
                    title: 'Remote',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                  messages: [],
                })
              )
            )
          )
          return { ok: true, status: 200, json: async () => ({}), text: async () => content }
        }
        return { ok: true, status: 200, json: async () => ({}), text: async () => 'ok' }
      })
    )

    driver = new WebDavProviderDriver({ url: 'https://dav.com/', username: 'u', password: 'p' })
    service = new ShardedSyncService(driver)
    manager = new SyncManager(db as AppDb, logger as AbstractLogger, 'device-1')
    manager.setAdapter(service)
  })

  it('should push and pull conversations correctly through SyncManager', async () => {
    await manager.pullAll()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((db as any).conversation.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        title: 'Remote',
      })
    )
  })
})
