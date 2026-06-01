import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebDavBackendDriver } from '@/sync/webdav-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { type SyncPayload } from '@/sync/types'

describe('WebDav Sync', () => {
  const config = { url: 'https://dav.com/', username: 'u', password: 'p' }
  let driver: WebDavBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('shard_map.json'))
          return {
            ok: true,
            status: 200,
            json: async () => ({
              n: 1,
              shards: [{ index: 0, url: driver.getRootUrl(), readOnly: false }],
            }),
            text: async () => '',
          }
        if (url.includes('.sync_metadata.json'))
          return { ok: true, status: 200, json: async () => ({ keys: {} }), text: async () => '' }
        return { ok: true, status: 200, json: async () => ({}), text: async () => 'ok' }
      })
    )
    driver = new WebDavBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files', async () => {
    const payload = {
      conversation: {
        id: 123,
        title: 'T',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: 1,
      },
      messages: [],
      syncVersion: 1,
      deviceId: 'd',
    } as unknown as SyncPayload

    const result = await service.push(payload)
    expect(result.isOk()).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('keys/123.000.md'),
      expect.objectContaining({
        method: 'PUT',
      })
    )
  })
})
