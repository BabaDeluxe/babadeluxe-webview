import Statsig from 'statsig-js'
import type { AnalyticsProvider } from '../types'
import type { AbstractLogger } from '@/logger'

/**
 * Statsig analytics provider implementation.
 * Uses the 'statsig-js' library for feature flags and event logging.
 */
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
      // Initialize Statsig with a default anonymous user
      await Statsig.initialize(this._clientKey, { userID: 'anonymous' })
      this._isInitialized = true
      this._logger.log(`[${this.name}] Initialized with key: ${this._clientKey}`)
    } catch (error) {
      this._logger.error(`[${this.name}] Initialization failed`, { error })
    }
  }

  trackEvent(event: string, properties?: Record<string, any>): void {
    if (!this._isInitialized) return
    Statsig.logEvent(event, null, properties)
    this._logger.debug(`[${this.name}] Tracked event: ${event}`, properties)
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (!this._isInitialized) return
    void Statsig.updateUser({ userID: userId, custom: traits })
    this._logger.debug(`[${this.name}] Identified user: ${userId}`, traits)
  }
}
