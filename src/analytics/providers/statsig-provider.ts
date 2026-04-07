import type { AnalyticsProvider } from '../types'
import type { AbstractLogger } from '@/logger'

// Statsig JS SDK Mock/Stub implementation for open source
// In a real production build, one would import 'statsig-js'
export class StatsigProvider implements AnalyticsProvider {
  readonly name = 'Statsig'
  private _isInitialized = false

  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _clientKey?: string
  ) {
    if (this._clientKey) {
      this._initialize()
    }
  }

  private async _initialize(): Promise<void> {
    if (this._isInitialized) return

    // In a real app, we would do:
    // await Statsig.initialize(this._clientKey);

    this._isInitialized = true
    this._logger.log(`[${this.name}] Initialized with key: ${this._clientKey}`)
  }

  trackEvent(event: string, properties?: Record<string, any>): void {
    if (!this._isInitialized) return
    // Statsig.logEvent(event, null, properties);
    this._logger.debug(`[${this.name}] Tracked event: ${event}`, properties)
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (!this._isInitialized) return
    // Statsig.updateUser({ userID: userId, custom: traits });
    this._logger.debug(`[${this.name}] Identified user: ${userId}`, traits)
  }
}
