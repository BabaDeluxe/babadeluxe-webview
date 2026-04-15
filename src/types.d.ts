declare module '*.css'

export declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
  }
}
