import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebDAVSyncAdapter } from '@/sync/webdav-adapter'

describe('WebDAVSyncAdapter', () => {
  let adapter: WebDAVSyncAdapter
  const config = { url: 'http://dav.com', username: 'u', password: 'p' }

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new WebDAVSyncAdapter(config)
    global.fetch = vi.fn()
  })

  it('should never send If-Match headers in push', async () => {
    const shardMap = JSON.stringify({
      n: 1,
      shards: [{ index: 0, url: 'http://dav.com', readOnly: false }]
    })

    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => shardMap }) // GET map
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // HEAD shard root
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"keys":[]}' }) // GET metadata
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // PUT metadata
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // PUT chat

    const payload = {
      conversation: { id: 123 },
      messages: [],
      syncVersion: 1,
      deviceId: 'd1',
      syncId: 's1'
    } as any

    const result = await adapter.push(payload)
    expect(result.isOk()).toBe(true)

    for (const [_, options] of (global.fetch as any).mock.calls) {
      if (options.headers) {
        expect(options.headers).not.toHaveProperty('If-Match')
        expect(options.headers).not.toHaveProperty('if-match')
      }
    }
  })

  it('should return offline error if HEAD fails', async () => {
    const shardMap = JSON.stringify({
      n: 1,
      shards: [{ index: 0, url: 'http://dav.com', readOnly: false }]
    })

    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => shardMap }) // GET map
      .mockResolvedValueOnce({ ok: false, status: 500 }) // HEAD fails

    const payload = { conversation: { id: 123 } } as any
    const result = await adapter.push(payload)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('Offline')
  })

  it('should rotate shard when threshold is reached', async () => {
    const shardMap = JSON.stringify({
      n: 1,
      shards: [{ index: 0, url: 'http://dav.com', readOnly: false }]
    })

    const keys = Array.from({ length: 50000 }, (_, i) => i.toString())
    const metadata = JSON.stringify({ keys })

    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => shardMap }) // GET map
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // HEAD root
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => metadata }) // GET metadata
      .mockResolvedValueOnce({ ok: true, status: 201, text: async () => '' }) // MKCOL shard_1
      .mockResolvedValueOnce({ ok: true, status: 201, text: async () => '' }) // MKCOL chats
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // PUT map
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // PUT metadata
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' }) // PUT chat

    const payload = { conversation: { id: 999999 }, messages: [] } as any
    const result = await adapter.push(payload)

    expect(result.isOk()).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('shard_1'), expect.objectContaining({ method: 'MKCOL' }))
  })
})
