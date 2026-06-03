import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const messageChunkSchema = z.object({
  messageId: z.number(),
  chunk: z.string(),
  sequence: z.number(),
})

describe('Socket Contract Validation', () => {
  it('validates message chunk payload', () => {
    const payload = { messageId: 123, chunk: 'hello', sequence: 1 }
    expect(messageChunkSchema.parse(payload)).toEqual(payload)
  })

  it('validates reasoning chunk payload', () => {
    const payload = { messageId: 123, chunk: 'thinking...', sequence: 1 }
    expect(messageChunkSchema.parse(payload)).toEqual(payload)
  })

  it('fails on invalid payload', () => {
    const payload = { messageId: '123', chunk: 456 }
    expect(() => messageChunkSchema.parse(payload)).toThrow()
  })
})
