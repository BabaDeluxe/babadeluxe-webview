/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AzureDevOpsBackendDriver } from '@/sync/azure-devops-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { SyncAuthError } from '@/errors'
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

describe('Azure DevOps Sync', () => {
  const config = { org: 'o', project: 'p', repo: 'r', pat: 'token' }
  let driver: AzureDevOpsBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.clearAllMocks()
    driver = new AzureDevOpsBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using Azure DevOps API with fresh oldObjectId', async () => {
    const gotMock = vi.mocked(got) as any

    gotMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('shard_map.json'))
        return {
          statusCode: 200,
          body: JSON.stringify({
            n: 1,
            shards: [{ index: 0, url: 'https://dev.azure.com/o/p/_apis', readOnly: false }],
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
      if (url.includes('/refs'))
        return { statusCode: 200, body: { value: [{ objectId: 'fresh-sha' }] } }
      return { statusCode: 200, body: {} }
    })

    gotMock.head.mockResolvedValue({ statusCode: 200 })
    gotMock.post.mockResolvedValue({ statusCode: 200, body: {} })

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

    await service.push(payload)

    expect(gotMock.get).toHaveBeenCalledWith(
      expect.stringContaining('git/repositories/r/refs'),
      expect.anything()
    )

    expect(gotMock.post).toHaveBeenCalledWith(
      expect.stringContaining('git/repositories/r/pushes'),
      expect.objectContaining({
        json: expect.objectContaining({
          refUpdates: expect.arrayContaining([
            expect.objectContaining({ oldObjectId: 'fresh-sha' }),
          ]),
        }),
      })
    )
  })

  it('should handle Azure DevOps 401 Unauthorized', async () => {
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
})
