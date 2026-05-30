/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncManager } from '@/sync/sync-manager'
import { WebDavBackendDriver } from '@/sync/webdav-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'

// Mock got
vi.mock('got', () => {
  const got: any = vi.fn()
  got.get = vi.fn()
  got.put = vi.fn()
  got.post = vi.fn()
  got.head = vi.fn()
  got.delete = vi.fn()
  got.extend = vi.fn().mockReturnValue(got)
  return { default: got }
})

import got from 'got'

describe('Sync Integration', () => {
  let db: any
  let logger: any
  let driver: WebDavBackendDriver
  let service: ShardedSyncService
  let manager: SyncManager

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock DB
    db = {
      conversation: {
        get: vi.fn(),
        put: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      message: {
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: [] }),
        bulkDelete: vi.fn(),
        bulkPut: vi.fn(),
      },
    }

    logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      trace: vi.fn(),
    }
    driver = new WebDavBackendDriver({ url: 'https://dav.test/', username: 'u', password: 'p' })
    service = new ShardedSyncService(driver)
    manager = new SyncManager(db, logger, 'device-1')
    manager.setAdapter(service)
  })

  it('should push and pull conversations correctly through SyncManager using got', async () => {
    const gotMock = vi.mocked(got) as any

    gotMock.mockImplementation(async (url: string) => {
      if (url.includes('shard_map.json')) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            n: 1,
            shards: [{ index: 0, url: 'https://dav.test/', readOnly: false }],
          }),
          headers: {},
        }
      }
      if (url.includes('.sync_metadata.json')) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            keys: {
              '1': {
                path: 'keys/1.000.md',
                sha256: 'ignore',
                ts: Date.now(),
                parts: ['keys/1.000.md'],
              },
            },
          }),
          headers: {},
        }
      }
      return { statusCode: 200, body: '', headers: {} }
    })

    gotMock.get.mockImplementation(async (url: string) => {
      if (url === 'keys/1.000.md') {
        const snapshot = {
          id: 1,
          syncVersion: 2,
          conversation: {
            id: 1,
            title: 'Remote',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: 1,
          },
          messages: [],
          deviceId: 'device-2',
        }
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot, null, 2))))
        return { statusCode: 200, body: content, headers: {} }
      }
      if (url === '.sync_metadata.json') {
        return {
          statusCode: 200,
          body: {
            keys: {
              '1': {
                path: 'keys/1.000.md',
                sha256: 'ignore',
                ts: Date.now(),
                parts: ['keys/1.000.md'],
              },
            },
          },
          headers: {},
        }
      }
      return { statusCode: 404 }
    })

    gotMock.head.mockResolvedValue({ statusCode: 200 })

    db.conversation.get.mockResolvedValue({ isOk: () => true, isErr: () => false, value: null })

    await manager.pullAll()

    expect(db.conversation.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        title: 'Remote',
      })
    )
  })
})
