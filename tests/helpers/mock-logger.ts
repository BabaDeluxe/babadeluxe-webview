/* eslint-disable @typescript-eslint/no-unused-vars */
import type { AbstractLogger } from '@/logger'

export class MockLogger implements AbstractLogger {
  info(..._args: unknown[]): void {}
  debug(..._args: unknown[]): void {}
  warn(..._args: unknown[]): void {}
  error(..._args: unknown[]): void {}
  log(..._args: unknown[]): void {}
  trace(..._args: unknown[]): void {}
}

export const mockLogger = new MockLogger()
