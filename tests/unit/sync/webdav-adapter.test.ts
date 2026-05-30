/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebDavBackendDriver } from '@/sync/webdav-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { SyncAuthError } from '@/errors'
import { type SyncPayload } from '@/sync/types'

describe('WebDav Sync', () => {
  const config = { url: 'https://dav.test/', username: 'u', password: 'p' }
  let driver: WebDavBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    driver = new WebDavBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should perform offline check with HEAD', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValue(new Error('Network error'))

    const payload = {
      conversation: { id: 1 },
      messages: [],
      syncVersion: 1,
      deviceId: 'd',
    } as unknown as SyncPayload
    const result = await service.push(payload)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('Offline')
    expect(fetchMock).toHaveBeenCalledWith(config.url, expect.objectContaining({ method: 'HEAD' }))
  })

  it('should push files and update metadata', async () => {
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
          json: async () => ({ n: 1, shards: [{ index: 0, url: config.url, readOnly: false }] }),
        } as any
      if (urlStr.includes('.sync_metadata.json') && method !== 'PUT')
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: {} }),
        } as any
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({}),
        headers: { get: () => null },
      } as any
    })

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

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('_sync/shard_map.json'),
      expect.anything()
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('.sync_metadata.json'),
      expect.objectContaining({
        method: 'PUT',
      })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('keys/123.000.md'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.not.objectContaining({ 'If-Match': expect.anything() }),
      })
    )
  })

  it('should handle WebDAV 401 Unauthorized', async () => {
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

  it('should return empty array if a chunk is missing during pull', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      const urlStr = String(url)
      const method = init?.method?.toUpperCase() || 'GET'
      if (method === 'HEAD') return { ok: true, status: 200 } as any
      if (urlStr.includes('shard_map.json'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ n: 1, shards: [{ index: 0, url: config.url, readOnly: false }] }),
        } as any
      if (urlStr.includes('.sync_metadata.json'))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            keys: {
              test: {
                path: 'keys/test.000.md',
                parts: ['keys/test.000.md', 'keys/test.001.md'],
                sha256: 'h',
                ts: 0,
              },
            },
          }),
        } as any
      if (urlStr.includes('test.000.md'))
        return {
          ok: true,
          status: 200,
          text: async () => 'chunk1',
          headers: { get: () => null },
        } as any
      if (urlStr.includes('test.001.md'))
        return { ok: false, status: 404, headers: { get: () => null } } as any
      return { ok: true, status: 200, headers: { get: () => null } } as any
    })

    const result = await service.pull()
    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toHaveLength(0)
  })
})
