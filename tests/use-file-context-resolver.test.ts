/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mountComposable } from './helpers/mount-composable'
import { useFileContextResolver } from '@/composables/use-file-context-resolver'
import { getVsCodeApi } from '@/vs-code/api'
import type { ContextReference } from '@/database/types'
import type { FileContextResponse } from '@/vs-code/types'

// JSDOM has a Window, but we want to control postMessage + listeners.
vi.mock('@/vs-code/api')

describe('useFileContextResolver', () => {
  const postMessageMock = vi.fn()

  beforeEach(() => {
    // Reset mocks
    postMessageMock.mockReset()

    // Mock getVsCodeApi() to succeed and return our fake VS Code API
    vi.mocked(getVsCodeApi).mockReturnValue({
      isOk: () => true,
      isErr: () => false,
      value: {
        postMessage: postMessageMock,
        setState: vi.fn(),
        getState: vi.fn(),
      },
    } as unknown as ReturnType<typeof getVsCodeApi>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resolves context items from fileContext:response', async () => {
    // Arrange: mount composable to get resolveFromReferences
    const { resolveFromReferences } = mountComposable(() => useFileContextResolver())

    const references: ContextReference[] = [
      {
        type: 'file',
        filePath: '/foo/bar.ts',
      },
    ]
    // Act: call resolveFromReferences, but don't await yet
    const resultPromise = resolveFromReferences(references)

    // Ensure the composable had time to attach the window listener
    await nextTick()

    // Grab the request that was posted to VS Code
    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const postedMessage = postMessageMock.mock.calls[0]?.[0] as {
      type: string
      requestId: string
      filePaths: string[]
    }

    expect(postedMessage.type).toBe('fileContext:resolve')
    expect(postedMessage.filePaths).toEqual(['/foo/bar.ts'])
    const requestId = postedMessage.requestId

    // Simulate the extension replying with fileContext:response
    const response: FileContextResponse = {
      type: 'fileContext:response',
      requestId,
      items: [
        {
          filePath: '/foo/bar.ts',
          snippet: 'console.log("hello from test")',
        },
      ],
    }

    window.dispatchEvent(
      new MessageEvent('message', {
        data: response,
      })
    )

    const result = await resultPromise

    // Assert: resolver turned the response into content items
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.filePath).toBe('/foo/bar.ts')
      expect(result.value[0]?.content).toBe('console.log("hello from test")')
    }
  })

  it('returns ValidationError when VS Code API is not available', async () => {
    // Make getVsCodeApi return Err
    vi.mocked(getVsCodeApi).mockReturnValue({
      isOk: () => false,
      isErr: () => true,
      error: new Error('Not in VS Code'),
    } as unknown as ReturnType<typeof getVsCodeApi>)

    const { resolveFromReferences } = mountComposable(() => useFileContextResolver())

    const references: ContextReference[] = [
      { type: 'file', filePath: '/foo/bar.ts' }, // non-empty so we pass the first branch
    ]

    const result = await resolveFromReferences(references)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error.message).toContain('VS Code API not available')
    }
  })

  it('returns ValidationError when references have no valid file paths', async () => {
    const { resolveFromReferences } = mountComposable(() => useFileContextResolver())

    const references: ContextReference[] = [
      { type: 'file', filePath: '   ' },
      { type: 'file', filePath: '' },
    ]

    const result = await resolveFromReferences(references)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('No valid file paths in context references')
    }
  })
})
