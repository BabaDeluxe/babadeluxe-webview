import { isOfflineMode } from '@/env-validator'
import type { AnalyticsProvider } from './types'

export class AnalyticsManager {
  private readonly _providers: AnalyticsProvider[] = []
  private readonly _isOffline: boolean

  constructor() {
    this._isOffline = isOfflineMode()
  }

  addProvider(provider: AnalyticsProvider): void {
    this._providers.push(provider)
  }

  trackEvent(event: string, properties?: Record<string, any>): void {
    if (this._isOffline) return
    for (const provider of this._providers) {
      provider.trackEvent(event, properties)
    }
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (this._isOffline) return
    for (const provider of this._providers) {
      provider.identify(userId, traits)
    }
  }
}
