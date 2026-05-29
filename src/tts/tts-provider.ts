export interface TTSOptions {
  speed?: number
  voice?: string
}

export interface TTSProvider {
  speak(text: string, options?: TTSOptions): Promise<void>
  stop(): void
  isReady(): boolean
}
