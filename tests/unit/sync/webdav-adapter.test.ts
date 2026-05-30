/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebDavBackendDriver } from '@/sync/webdav-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { SyncAuthError } from '@/errors'
import { type SyncPayload } from '@/sync/types'

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

describe('WebDav Sync', () => {
  const config = { url: 'https://dav.test/', username: 'u', password: 'p' }
  let driver: WebDavBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.clearAllMocks()
    driver = new WebDavBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should perform offline check with HEAD', async () => {
    const gotMock = vi.mocked(got) as any
    gotMock.head.mockRejectedValue(new Error('Network error'))

    const payload = {
      conversation: { id: 1 },
      messages: [],
      syncVersion: 1,
      deviceId: 'd',
    } as unknown as SyncPayload
    const result = await service.push(payload)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('Offline')
    expect(gotMock.head).toHaveBeenCalledWith(
      config.url,
      expect.objectContaining({ throwHttpErrors: false })
    )
  })

  it('should push files and update metadata', async () => {
    const gotMock = vi.mocked(got) as any

    // Mock for ShardedSyncService (which calls got() directly)
    gotMock.mockImplementation(async (url: string) => {
      if (url.includes('shard_map.json'))
        return {
          statusCode: 200,
          body: JSON.stringify({ n: 1, shards: [{ index: 0, url: config.url, readOnly: false }] }),
          headers: {},
        }
      if (url.includes('.sync_metadata.json'))
        return {
          statusCode: 200,
          body: JSON.stringify({ keys: {} }),
          headers: {},
        }
      return {
        statusCode: 200,
        body: '',
        headers: {},
      }
    })

    // Mock for Driver methods
    gotMock.get.mockResolvedValue({ statusCode: 200, body: { keys: {} }, headers: {} })
    gotMock.put.mockResolvedValue({ statusCode: 200, body: '', headers: {} })
    gotMock.head.mockResolvedValue({ statusCode: 200 })

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

    await service.push(payload)

    expect(gotMock.put).toHaveBeenCalledWith(
      expect.stringContaining('keys/123.000.md'),
      expect.objectContaining({
        body: expect.anything(),
      })
    )
  })

  it('should handle WebDAV 401 Unauthorized', async () => {
    const gotMock = vi.mocked(got) as any
    gotMock.mockResolvedValue({
      statusCode: 401,
      body: 'Unauthorized',
      headers: {},
    })

    const result = await service.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(SyncAuthError)
  })
})
