import { io, type Socket } from 'socket.io-client'
import { useAnonTrialStore } from '@/stores/use-anon-trial-store'
import { useChatSocketStore } from '@/stores/use-chat-socket-store'
import { emitWithTimeout } from '@/emit-with-timeout'
import { ref } from 'vue'

export class AnonSocketService {
  private socket: Socket | null = null
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  connect(token: string) {
    if (this.socket) {
      this.socket.disconnect()
    }

    const anonTrialStore = useAnonTrialStore()
    const chatSocketStore = useChatSocketStore()

    this.socket = io(`${this.baseUrl}/anon`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })

    this.socket.on('anon:messageChunk', (payload: { messageId: number, chunk: string, sequence: number }) => {
      const state = chatSocketStore.getMessageState(payload.messageId)
      if (state?.onChunk) {
        state.onChunk(payload.chunk)
      }
    })

    this.socket.on('anon:messageComplete', (payload: { messageId: number, fullContent: string }) => {
      const state = chatSocketStore.getMessageState(payload.messageId)
      if (state?.onComplete) {
        state.onComplete(payload.fullContent)
      }
      chatSocketStore.deleteMessageState(payload.messageId)
      anonTrialStore.incrementUsed()
    })

    this.socket.on('anon:trialExhausted', () => {
      anonTrialStore.exhausted = true
      localStorage.setItem('anon-trial-exhausted', 'true')
      this.disconnect()
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  async sendMessage(payload: any) {
    if (!this.socket) return

    const socketRef = ref(this.socket as any)
    return emitWithTimeout({
      socket: socketRef,
      actionName: 'anon:sendMessage' as any,
      payload
    })
  }
}
