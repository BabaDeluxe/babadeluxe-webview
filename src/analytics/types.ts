export interface AnalyticsProvider {
  readonly name: string
  trackEvent(event: string, properties?: Record<string, unknown>): void
  identify(userId: string, traits?: Record<string, unknown>): void
}
