import { type InjectionKey, inject } from 'vue'
import { InitializationError } from '@/errors'

export function safeInject<T>(key: InjectionKey<T>): T {
  const value = inject(key)

  if (value === undefined) {
    const keyName = key.description ?? 'Unknown dependency'
    throw new InitializationError(
      `${keyName} was not provided. Ensure app.provide(${keyName}_KEY, ...) is called in main.ts before mounting.`
    )
  }

  return value
}
