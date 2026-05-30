/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabBackendDriver } from '@/sync/gitlab-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { SyncAuthError, RateLimitError } from '@/errors'
import { type SyncPayload } from '@/sync/types'

describe('GitLab Sync', () => {
  const config = { token: 't', projectId: '123' }
  let driver: GitLabBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    driver = new GitLabBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using GitLab API', async () => {
    const fetchMock = vi.mocked(fetch)

    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method?.toUpperCase() || 'GET'

      if (method === 'HEAD')
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as any
      if (urlStr.includes('shard_map.json'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            n: 1,
            shards: [{ index: 0, url: 'https://gitlab.com/api/v4', readOnly: false }],
          }),
        } as any
      if (urlStr.includes('.sync_metadata.json') && method !== 'PUT')
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: {} }),
        } as any
      if (urlStr.includes('statistics=true'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ statistics: { repository_size: 1000 } }),
        } as any
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
        headers: { get: () => null },
      } as any
    })

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

    await service.push(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('projects/123/repository/files/keys%2F456.000.md'),
      expect.objectContaining({
        method: expect.stringMatching(/PUT|POST/),
        headers: expect.objectContaining({
          Authorization: 'Bearer t',
        }),
      })
    )
  })

  it('should handle GitLab 401 Unauthorized', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      json: async () => ({}),
      headers: { get: () => null },
    } as any)

    const result = await service.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(SyncAuthError)
  })

  it('should handle GitLab 429 Rate Limit', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
      json: async () => ({}),
      headers: { get: () => null },
    } as any)

    const result = await service.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(RateLimitError)
  })
})
