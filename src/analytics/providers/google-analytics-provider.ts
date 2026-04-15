import type { AnalyticsProvider } from '../types'
import type { AbstractLogger } from '@/logger'

export class GoogleAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'GoogleAnalytics'
  private _isInitialized = false

  constructor(
    private readonly _logger: AbstractLogger,
    private readonly _measurementId?: string
  ) {
    if (this._measurementId) {
      this._initialize()
    }
  }

  private _initialize(): void {
    if (this._isInitialized) return

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this._measurementId}`
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', this._measurementId)

    this._isInitialized = true
    this._logger.log(`[${this.name}] Initialized with ID: ${this._measurementId}`)
  }

  trackEvent(event: string, properties?: Record<string, any>): void {
    if (!this._isInitialized) return
    window.gtag('event', event, properties)
    this._logger.debug(`[${this.name}] Tracked event: ${event}`, properties)
  }

  identify(userId: string, traits?: Record<string, any>): void {
    if (!this._isInitialized) return
    window.gtag('config', this._measurementId, {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      user_id: userId,
      ...traits,
    })
    this._logger.debug(`[${this.name}] Identified user: ${userId}`, traits)
  }
}
