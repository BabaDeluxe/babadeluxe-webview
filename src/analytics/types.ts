export interface AnalyticsProvider {
  readonly name: string
  trackEvent(event: string, properties?: Record<string, any>): void
  identify(userId: string, traits?: Record<string, any>): void
}
