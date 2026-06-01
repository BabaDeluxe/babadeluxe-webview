import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AzureDevOpsProviderDriver } from '@/sync/azure-devops-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { type SyncPayload } from '@/sync/types'

describe('Azure DevOps Sync', () => {
  const config = { org: 'o', project: 'p', repo: 'r', pat: 't' }
  let driver: AzureDevOpsProviderDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: unknown) => {
        const options = init as RequestInit | undefined
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
        if (url.includes('refs?filter=heads/main'))
          return {
            ok: true,
            status: 200,
            json: async () => ({ value: [{ objectId: 'old-sha' }] }),
            text: async () => '',
          }
        if (url.includes('items?path=/keys/101.000.md') && options?.method === 'HEAD')
          return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      })
    )
    driver = new AzureDevOpsProviderDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using Azure DevOps API with fresh oldObjectId', async () => {
    const payload = {
      conversation: {
        id: 101,
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
      expect.stringContaining('refs?filter=heads/main'),
      expect.anything()
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('pushes'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('old-sha'),
      })
    )
  })
})
