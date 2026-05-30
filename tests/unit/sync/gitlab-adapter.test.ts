/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitLabBackendDriver } from '@/sync/gitlab-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { SyncAuthError, RateLimitError } from '@/errors'
import { type SyncPayload } from '@/sync/types'

// Mock got
vi.mock('got', () => {
  const got: any = vi.fn()
  got.extend = vi.fn().mockReturnThis()
  got.get = vi.fn()
  got.put = vi.fn()
  got.post = vi.fn()
  got.head = vi.fn()
  got.delete = vi.fn()
  return { default: got }
})

import got from 'got'

describe('GitLab Sync', () => {
  const config = { token: 't', projectId: '123' }
  let driver: GitLabBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.clearAllMocks()
    driver = new GitLabBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using GitLab API', async () => {
    const gotMock = vi.mocked(got) as any

    gotMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('shard_map.json'))
        return {
          statusCode: 200,
          body: JSON.stringify({
            n: 1,
            shards: [{ index: 0, url: 'https://gitlab.com/api/v4', readOnly: false }],
          }),
        }
      if (url.includes('.sync_metadata.json') && init?.method !== 'PUT')
        return {
          statusCode: 200,
          body: JSON.stringify({ keys: {} }),
        }
      return { statusCode: 200, body: '', headers: {} }
    })

    gotMock.get.mockImplementation(async (url: string) => {
      if (url.includes('statistics=true'))
        return { statusCode: 200, body: { statistics: { repository_size: 1000 } } }
      return { statusCode: 200, body: {} }
    })

    gotMock.head.mockResolvedValue({ statusCode: 200 })
    gotMock.put.mockResolvedValue({ statusCode: 200, body: {} })

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

    expect(gotMock.put).toHaveBeenCalledWith(
      expect.stringContaining('projects/123/repository/files/keys%2F456.000.md'),
      expect.objectContaining({
        json: expect.objectContaining({
          branch: 'main',
        }),
      })
    )
  })

  it('should handle GitLab 401 Unauthorized', async () => {
    const gotMock = vi.mocked(got) as any
    gotMock.get.mockResolvedValue({
      statusCode: 401,
      body: 'Unauthorized',
      headers: {},
    })

    const result = await service.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(SyncAuthError)
  })

  it('should handle GitLab 429 Rate Limit', async () => {
    const gotMock = vi.mocked(got) as any
    gotMock.get.mockResolvedValue({
      statusCode: 429,
      body: 'Too Many Requests',
      headers: {},
    })

    const result = await service.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(RateLimitError)
  })
})
