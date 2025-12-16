/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Page } from '@playwright/test'

export interface MockChatSocketOptions {
  // Response delay for acknowledgments (ms)
  ackDelayMs?: number
  // Delay between streaming chunks (ms)
  chunkDelayMs?: number
  // Number of chunks to send per message
  chunksPerMessage?: number
  // Simulate error for specific message IDs
  errorMessageIds?: number[]
}

export async function mockChatSocket(page: Page, options: MockChatSocketOptions = {}) {
  const { ackDelayMs = 10, chunkDelayMs = 50, chunksPerMessage = 3, errorMessageIds = [] } = options

  const backendUrl = process.env.VITE_SOCKET_URL || 'http://localhost:3700'
  await page.route(`${backendUrl}/**`, (route) => route.abort())
  await page.route('**/socket.io/**', (route) => route.abort())

  await page.addInitScript(
    ({ ackDelay, chunkDelay, chunkCount, errorIds }) => {
      const mockIo = () => {
        const eventHandlers = new Map<string, Array<(data: any) => void>>()
        const activeStreams = new Map<number, number[]>()

        const mockSocket = {
          connected: false,

          on(event: string, handler: (data: any) => void) {
            if (!eventHandlers.has(event)) {
              eventHandlers.set(event, [])
            }
            eventHandlers.get(event)!.push(handler)
            return mockSocket
          },

          emit(event: string, data: any, ack?: (response: any) => void) {
            if (event === 'chat:sendMessage') {
              const { messageId } = data

              if (errorIds.includes(messageId)) {
                setTimeout(() => {
                  ack?.({ success: false, error: 'Mock error' })
                }, ackDelay)
                return
              }

              setTimeout(() => {
                ack?.({ success: true })
              }, ackDelay)

              const mockChunks = Array.from({ length: chunkCount }, (_, i) => `Chunk ${i + 1}. `)
              const timeouts: number[] = []

              mockChunks.forEach((chunk, index) => {
                const timeoutId = setTimeout(
                  () => {
                    if (!activeStreams.has(messageId)) return

                    const handlers = eventHandlers.get('chat:messageChunk')
                    handlers?.forEach((h) => {
                      h({ messageId, chunk })
                    })
                  },
                  ackDelay + chunkDelay * (index + 1)
                ) as unknown as number
                timeouts.push(timeoutId)
              })

              const completeTimeoutId = setTimeout(
                () => {
                  if (!activeStreams.has(messageId)) return

                  const handlers = eventHandlers.get('chat:messageComplete')
                  handlers?.forEach((h) => {
                    h({ messageId })
                  })
                  activeStreams.delete(messageId)
                },
                ackDelay + chunkDelay * (mockChunks.length + 1)
              ) as unknown as number
              timeouts.push(completeTimeoutId)

              activeStreams.set(messageId, timeouts)
              return
            }

            if (event !== 'chat:abortMessage') {
              return
            }

            const { messageId } = data

            const timeouts = activeStreams.get(messageId)
            if (timeouts) {
              timeouts.forEach(clearTimeout)
            }

            setTimeout(() => {
              ack?.({ success: true })
              // Only fire complete if we actually had an active stream
              if (timeouts && timeouts.length > 0) {
                const handlers = eventHandlers.get('chat:messageComplete')
                handlers?.forEach((h) => {
                  h({ messageId })
                })
              }
            }, ackDelay)
            return
          },

          off(event: string, handler?: any) {
            if (handler) {
              const handlers = eventHandlers.get(event)
              if (handlers) {
                const index = handlers.indexOf(handler)
                if (index !== -1) handlers.splice(index, 1)
              }
            } else {
              eventHandlers.delete(event)
            }
            return mockSocket
          },

          disconnect() {
            mockSocket.connected = false
            return mockSocket
          },

          connect() {
            mockSocket.connected = true
            setTimeout(() => {
              const handlers = eventHandlers.get('connect')
              handlers?.forEach((h) => {
                h({})
              })
            }, 10)
            return mockSocket
          },
        }

        setTimeout(() => {
          mockSocket.connect()
        }, 50)
        return mockSocket
      }

      Object.defineProperty(window, 'io', {
        get: () => mockIo,
        set: () => {},
        configurable: true,
      })
      ;(window as any).__MOCK_SOCKET_INSTALLED__ = true
    },
    {
      ackDelay: ackDelayMs,
      chunkDelay: chunkDelayMs,
      chunkCount: chunksPerMessage,
      errorIds: errorMessageIds,
    }
  )
}
