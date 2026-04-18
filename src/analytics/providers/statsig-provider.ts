/* eslint-disable @typescript-eslint/no-explicit-any */
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

  trackEvent(event: string, properties?: Record<string, any>): void {
    if (!this._isInitialized || !this._client) return
    this._client.logEvent(event, undefined, properties)
    this._logger.debug(`[${this.name}] Tracked event: ${event}`, properties)
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (!this._isInitialized || !this._client) return
    // Note: In @statsig/js-client, updateUserAsync is used for updating user identity
    void this._client.updateUserAsync({ userID: userId, custom: traits })
    this._logger.debug(`[${this.name}] Identified user: ${userId}`, traits)
  }
}
