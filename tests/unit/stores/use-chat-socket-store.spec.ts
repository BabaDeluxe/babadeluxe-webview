import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatSocketStore } from '@/stores/use-chat-socket-store'

describe('useChatSocketStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('appends reasoning chunks', () => {
    const store = useChatSocketStore()
    store.appendReasoning(1, 'Thinking')
    store.appendReasoning(1, '...')
    expect(store.reasoningByMessageId.get(1)).toBe('Thinking...')
  })

  it('deletes reasoning when message state is deleted', () => {
    const store = useChatSocketStore()
    store.appendReasoning(1, 'Thinking')
    store.deleteMessageState(1)
    expect(store.reasoningByMessageId.has(1)).toBe(false)
  })

  it('resets all state', () => {
    const store = useChatSocketStore()
    store.appendReasoning(1, 'Thinking')
    store.setMessageState(1, {
      onChunk: undefined,
      onReasoningChunk: undefined,
      onComplete: undefined,
      onError: undefined,
      isStreaming: true,
      lastSequence: 1,
    })
    store.resetState()
    expect(store.reasoningByMessageId.size).toBe(0)
    expect(store.messageStateById.size).toBe(0)
  })
})
