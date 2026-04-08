import type { AnalyticsProvider } from '../types'
import type { AbstractLogger } from '@/logger'

declare global {
  interface Window {
    statsig: any
  }
}

export class StatsigProvider implements AnalyticsProvider {
  readonly name = 'Statsig'
  private _isInitialized = false

  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _clientKey?: string
  ) {
    if (this._clientKey) {
      void this._initialize()
    }
  }

  private async _initialize(): Promise<void> {
    if (this._isInitialized || !this._clientKey) return

    try {
      if (!window.statsig) {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/statsig-js@latest/dist/statsig-js.min.js'
        script.async = true

        await new Promise((resolve, reject) => {
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      await window.statsig.initialize(this._clientKey, { userID: 'anonymous' })
      this._isInitialized = true
      this._logger.log(`[${this.name}] Initialized with key: ${this._clientKey}`)
    } catch (error) {
      this._logger.error(`[${this.name}] Initialization failed`, { error })
    }
  }

  trackEvent(event: string, properties?: Record<string, any>): void {
    if (!this._isInitialized) return
    window.statsig.logEvent(event, null, properties)
    this._logger.debug(`[${this.name}] Tracked event: ${event}`, properties)
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (!this._isInitialized) return
    void window.statsig.updateUser({ userID: userId, custom: traits })
    this._logger.debug(`[${this.name}] Identified user: ${userId}`, traits)
  }
}
