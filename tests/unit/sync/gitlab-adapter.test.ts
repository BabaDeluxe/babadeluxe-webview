import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabProviderDriver } from '@/sync/gitlab-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { type SyncPayload } from '@/sync/types'

describe('GitLab Sync', () => {
  const config = { token: 't', projectId: 'p' }
  let driver: GitLabProviderDriver
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
        if (
          url.includes('projects/p/repository/files/keys%2F456.000.md') &&
          options?.method === 'HEAD'
        )
          return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      })
    )
    driver = new GitLabProviderDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using GitLab API', async () => {
    const payload = {
      conversation: {
        id: 456,
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
      expect.stringContaining('keys%2F456.000.md'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"branch":"main"'),
      })
    )
  })
})
