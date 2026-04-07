import type { AnalyticsProvider } from '../types'
import type { AbstractLogger } from '@/logger'

export class GoogleAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'GoogleAnalytics'

  constructor(private readonly _logger: AbstractLogger) {}

  trackEvent(event: string, properties?: Record<string, any>): void {
    this._logger.log(`[${this.name}] Tracking event: ${event}`, properties)
    // Actual implementation for GA would go here
  }

  identify(userId: string, traits?: Record<string, any>): void {
    this._logger.log(`[${this.name}] Identifying user: ${userId}`, traits)
    // Actual implementation for GA would go here
  }
}
