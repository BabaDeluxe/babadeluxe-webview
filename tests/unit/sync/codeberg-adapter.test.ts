import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CodebergBackendDriver } from '@/sync/codeberg-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { type SyncPayload } from '@/sync/types'

describe('Codeberg Sync', () => {
  const config = { token: 't', repo: 'o/r' }
  let driver: CodebergBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: unknown) => {
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
        if (url.includes('keys/789.000.md') && init?.method === 'PUT')
          return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
        if (url.includes('keys/789.000.md'))
          return {
            ok: true,
            status: 200,
            json: async () => ({ sha: 'cb-sha' }),
            text: async () => '',
          }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      })
    )
    driver = new CodebergBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using Codeberg API', async () => {
    const payload = {
      conversation: {
        id: 789,
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
      expect.stringContaining('keys/789.000.md'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('cb-sha'),
      })
    )
  })
})
