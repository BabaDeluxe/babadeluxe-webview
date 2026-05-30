/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubSyncAdapter } from '@/sync/github-adapter'
import { SyncAuthError, RateLimitError } from '@/errors'
import { type SyncPayload } from '@/sync/types'

describe('GitHubSyncAdapter', () => {
  const config = { token: 't', owner: 'o', repo: 'r' }
  let adapter: GitHubSyncAdapter

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    adapter = new GitHubSyncAdapter(config)
  })

  it('should push files using GitHub API and include fresh SHA', async () => {
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
            shards: [{ index: 0, url: 'https://api.github.com', readOnly: false }],
          }),
        } as any
      if (urlStr.includes('.sync_metadata.json') && method !== 'PUT')
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: {} }),
        } as any
      if (urlStr.includes('/contents/') && method === 'GET')
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: 'github-blob-sha' }),
        } as any
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as any
    })

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

    await adapter.push(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('repos/o/r/contents/keys/101.000.md'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('github-blob-sha'),
      })
    )
  })

  it('should handle 401 Unauthorized', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      headers: { get: () => null },
      json: async () => ({}),
    } as any)

    const result = await adapter.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(SyncAuthError)
  })

  it('should handle 403 Rate Limit', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: (n: string) => (n === 'x-ratelimit-remaining' ? '0' : null) },
      text: async () => 'Rate limit',
      json: async () => ({}),
    } as any)

    const result = await adapter.testConnection()
    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(RateLimitError)
  })
})
