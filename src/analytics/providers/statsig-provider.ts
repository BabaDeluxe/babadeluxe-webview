import { StatsigClient } from '@statsig/js-client'
import type { AnalyticsProvider } from '../types'
import type { AbstractLogger } from '@/logger'

export class StatsigProvider implements AnalyticsProvider {
  readonly name = 'Statsig'
  private _client?: StatsigClient
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
      this._client = new StatsigClient(this._clientKey, { userID: 'anonymous' })
      await this._client.initializeAsync()
      this._isInitialized = true
      this._logger.log(`[${this.name}] Initialized with key: ${this._clientKey}`)
    } catch (error) {
      this._logger.error(`[${this.name}] Initialization failed`, { error })
    }
  }

  trackEvent(event: string, properties?: Record<string, unknown>): void {
    const isReady = this._isInitialized && Boolean(this._client)
    if (!isReady) return
    this._client?.logEvent(event, undefined, properties as Record<string, string>)
    this._logger.debug(`[${this.name}] Tracked event: ${event}`, properties)
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    const isReady = this._isInitialized && Boolean(this._client)
    if (!isReady) return
    // Note: In @statsig/js-client, updateUserAsync is used for updating user identity
    type StatsigCustomUserTraits = NonNullable<
      Parameters<StatsigClient['updateUserAsync']>[0]
    >['custom']
    void this._client?.updateUserAsync({
      userID: userId,
      custom: traits as unknown as StatsigCustomUserTraits,
    })
    this._logger.debug(`[${this.name}] Identified user: ${userId}`, traits)
  }
}
