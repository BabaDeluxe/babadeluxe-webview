import { vi } from 'vitest'
import type { AbstractLogger } from '@/logger'

export function createMockLogger(): AbstractLogger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }
}
