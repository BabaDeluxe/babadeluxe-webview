import { describe, it, expect } from 'vitest'
import { hashKey, shardIndex, splitIntoChunks, reassembleChunks } from '@/sync/shard-utils'

describe('shard-utils', () => {
  it('should hash keys consistently', async () => {
    const h1 = await hashKey('test')
    const h2 = await hashKey('test')
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64)
  })

  it('should route to correct shard index', async () => {
    const idx = await shardIndex('key1', 3)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(3)
  })

  it('should split and reassemble chunks', () => {
    const content = 'A'.repeat(100)
    const chunks = splitIntoChunks(content, 30)
    expect(chunks).toHaveLength(4)
    expect(chunks[0]).toBe('A'.repeat(30))
    expect(chunks[3]).toBe('A'.repeat(10))
    expect(reassembleChunks(chunks)).toBe(content)
  })
})
