import { err, ok, Result } from 'neverthrow'
import { VsCodeAcquireError } from '@/errors'

export type VsCodeApi = Readonly<{
  postMessage: (message: unknown) => void
  setState: (state: unknown) => void
  getState: () => unknown
}>

declare global {
  // eslint-disable-next-line no-var
  var acquireVsCodeApi: undefined | (() => VsCodeApi)
}

let cached: VsCodeApi | null = null

export function getVsCodeApi(): Result<VsCodeApi, VsCodeAcquireError> {
  if (cached) return ok(cached)

  if (typeof globalThis.acquireVsCodeApi !== 'function') {
    return err(new VsCodeAcquireError('Not running inside VS Code webview'))
  }

  const acquireResult = Result.fromThrowable(
    () => globalThis.acquireVsCodeApi!(),
    (unknownError: unknown) => new VsCodeAcquireError('Failed to acquire VS Code API', unknownError)
  )()

  if (acquireResult.isErr()) return err(acquireResult.error)

  cached = acquireResult.value
  return ok(cached)
}
