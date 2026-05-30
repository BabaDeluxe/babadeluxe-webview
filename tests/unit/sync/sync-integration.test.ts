/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncManager } from '@/sync/sync-manager'
import { WebDavSyncAdapter } from '@/sync/webdav-adapter'

describe('Sync Integration', () => {
  let db: any
  let logger: any
  let adapter: WebDavSyncAdapter
  let manager: SyncManager

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())

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
    adapter = new WebDavSyncAdapter({ url: 'https://dav.test/', username: 'u', password: 'p' })
    manager = new SyncManager(db, logger, 'device-1')
    manager.setAdapter(adapter)
  })

  it('should push and pull conversations correctly through SyncManager', async () => {
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method?.toUpperCase() || 'GET'
      if (method === 'HEAD') return { ok: true, status: 200 } as any
      if (urlStr.includes('shard_map.json'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            n: 1,
            shards: [{ index: 0, url: 'https://dav.test/', readOnly: false }],
          }),
        } as any

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

      if (urlStr.includes('.sync_metadata.json'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            keys: {
              '1': {
                path: 'keys/1.000.md',
                sha256: 'ignore',
                ts: Date.now(),
                parts: ['keys/1.000.md'],
              },
            },
          }),
        } as any
      if (urlStr.includes('keys/1.000.md')) {
        return {
          ok: true,
          status: 200,
          text: async () => content,
          headers: { get: () => null },
        } as any
      }
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({}),
        headers: { get: () => null },
      } as any
    })

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
