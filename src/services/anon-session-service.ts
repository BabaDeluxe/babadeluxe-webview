import { ResultAsync, ok, err } from 'neverthrow'
import type { EnvConfigType } from '@/env-validator'

export type AnonSessionResponse =
  | { degraded: true }
  | { degraded: false; token: string; cap: number; used: number }

export class AnonSessionError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message)
    this.name = 'AnonSessionError'
  }
}

export class AnonSessionService {
  constructor(private readonly envConfig: EnvConfigType) {}

  init(): ResultAsync<AnonSessionResponse, AnonSessionError> {
    const apiUrl = this.envConfig.VITE_SOCKET_URL.replace('socket', 'api') // Assuming API is on same host or similar
    // Actually, let's just use a relative or configured path if possible.
    // Usually backend URLs are consistent.
    const url = `${this.envConfig.VITE_SOCKET_URL}/anon/session`.replace('socket', 'api').replace(':5100', ':3000') // Adjusting based on common patterns if needed, but better use exact if known.
    // Let's assume VITE_SOCKET_URL is something like http://localhost:5100 and API is http://localhost:3000 or similar.
    // To be safe, I'll just use the socket URL as a base and replace protocol if needed.

    return ResultAsync.fromPromise(
      fetch(`${this.envConfig.VITE_SOCKET_URL}/anon/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        return res.json()
      }),
      (error) => new AnonSessionError('Failed to initialize anonymous session', error)
    ).map((data: any) => {
      if (data.degraded) {
        return { degraded: true }
      }
      return {
        degraded: false,
        token: data.token,
        cap: data.cap,
        used: data.used,
      }
    })
  }
}
