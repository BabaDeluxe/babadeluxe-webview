/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubBackendDriver } from '@/sync/github-adapter'
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

describe('GitHub Sync', () => {
  const config = { token: 't', owner: 'o', repo: 'r' }
  let driver: GitHubBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.clearAllMocks()
    driver = new GitHubBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using GitHub API and include fresh SHA', async () => {
    const gotMock = vi.mocked(got) as any

    gotMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('shard_map.json'))
        return {
          statusCode: 200,
          body: JSON.stringify({
            n: 1,
            shards: [{ index: 0, url: 'https://api.github.com', readOnly: false }],
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
      if (url.includes('/contents/')) return { statusCode: 200, body: { sha: 'github-blob-sha' } }
      return { statusCode: 200, body: {} }
    })

    gotMock.put.mockResolvedValue({ statusCode: 200, body: {} })
    gotMock.head.mockResolvedValue({ statusCode: 200 })

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

    await service.push(payload)

    expect(gotMock.put).toHaveBeenCalledWith(
      expect.stringContaining('repos/o/r/contents/keys/101.000.md'),
      expect.objectContaining({
        json: expect.objectContaining({
          sha: 'github-blob-sha',
        }),
      })
    )
  })

  it('should handle 401 Unauthorized', async () => {
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

  it('should handle 403 Rate Limit', async () => {
    const gotMock = vi.mocked(got) as any
    gotMock.get.mockResolvedValue({
      statusCode: 403,
      headers: { 'x-ratelimit-remaining': '0' },
      body: 'Rate limit',
    })

    const result = await service.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(RateLimitError)
  })
})
