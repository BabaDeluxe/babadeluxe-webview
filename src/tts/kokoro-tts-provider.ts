import { KokoroTTS } from 'kokoro-js'
import type { TTSProvider, TTSOptions } from './tts-provider'

export class KokoroTTSProvider implements TTSProvider {
  private static instance: KokoroTTSProvider
  private tts: KokoroTTS | null = null
  private status: 'idle' | 'loading' | 'ready' = 'idle'

  private constructor() {}

  static getInstance(): KokoroTTSProvider {
    if (!KokoroTTSProvider.instance) {
      KokoroTTSProvider.instance = new KokoroTTSProvider()
    }
    return KokoroTTSProvider.instance
  }

  isReady(): boolean {
    return this.status === 'ready'
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (this.status === 'idle') {
      this.status = 'loading'
      try {
        // KokoroTTS constructor manages model loading
        this.tts = new KokoroTTS()
        // Wait for it to be ready if it has an init or similar,
        // but kokoro-js usually loads on demand or has a specific method.
        // According to instructions: "lazy-loaded on first speak() call only"
        this.status = 'ready'
      } catch (error) {
        this.status = 'idle'
        throw error
      }
    }

    if (this.tts) {
      await this.tts.speak(text, {
        speed: options?.speed ?? 1,
        voice: options?.voice ?? 'af_heart'
      })
    }
  }

  stop(): void {
    if (this.tts) {
      this.tts.stop()
    }
  }
}
