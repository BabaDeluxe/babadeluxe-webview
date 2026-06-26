import { describe, it, expect } from 'vitest'
import { useAtPicker } from '@/composables/use-at-picker'

describe('useAtPicker', () => {
  const mockSources = [
    { id: '1', label: 'Space 1', type: 'space' as const },
    { id: '2', label: 'Prompt 1', type: 'prompt' as const },
    { id: '3', label: 'Super 1', type: 'superpower' as const },
  ]

  it('should filter results based on query', () => {
    const { results, open } = useAtPicker(() => mockSources)
    open('Space')
    expect(results.value).toHaveLength(1)
    expect(results.value[0].label).toBe('Space 1')
  })

  it('should handle silent deduplication', () => {
    const { activeSources, accept, open } = useAtPicker(() => mockSources)
    open('Space')
    accept()
    expect(activeSources.value).toHaveLength(1)

    open('Space')
    const accepted = accept()
    expect(activeSources.value).toHaveLength(1)
    expect(accepted).not.toBeNull()
  })

  it('should enforce one space rule', () => {
    const extraSources = [...mockSources, { id: '4', label: 'Space 2', type: 'space' as const }]
    const { activeSources, accept, open, moveDown } = useAtPicker(() => extraSources)

    open('Space')
    accept() // Accepts Space 1
    expect(activeSources.value.find((s) => s.type === 'space')?.label).toBe('Space 1')

    open('Space')
    moveDown() // Move to Space 2
    accept()
    expect(activeSources.value.filter((s) => s.type === 'space')).toHaveLength(1)
    expect(activeSources.value.find((s) => s.type === 'space')?.label).toBe('Space 2')
  })

  it('should close picker when no results on accept', () => {
    const { results, isOpen, accept, open } = useAtPicker(() => [])
    open('nothing')
    expect(results.value).toHaveLength(0)
    accept()
    expect(isOpen.value).toBe(false)
  })
})
