/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AzureDevOpsBackendDriver } from '@/sync/azure-devops-adapter'
import { ShardedSyncService } from '@/sync/sharded-sync-service'
import { SyncAuthError } from '@/errors'
import { type SyncPayload } from '@/sync/types'

describe('Azure DevOps Sync', () => {
  const config = { org: 'o', project: 'p', repo: 'r', pat: 'token' }
  let driver: AzureDevOpsBackendDriver
  let service: ShardedSyncService

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    driver = new AzureDevOpsBackendDriver(config)
    service = new ShardedSyncService(driver)
  })

  it('should push files using Azure DevOps API with fresh oldObjectId', async () => {
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
            shards: [{ index: 0, url: 'https://dev.azure.com/o/p/_apis', readOnly: false }],
          }),
        } as any
      if (urlStr.includes('.sync_metadata.json') && method !== 'PUT')
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: {} }),
        } as any
      if (urlStr.includes('refs?filter=heads/main'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ value: [{ objectId: 'fresh-sha' }] }),
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

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('refs?filter=heads/main'),
      expect.anything()
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('pushes?api-version=7.1'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('fresh-sha'),
      })
    )
  })

  it('should handle Azure DevOps 401 Unauthorized', async () => {
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
})
