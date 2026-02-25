import { getCurrentScope, onScopeDispose } from 'vue'

export function useTrackedTimeouts() {
  const activeTimeouts = new Set<ReturnType<typeof setTimeout>>()

  const createTimeout = (callback: () => void, delay: number): ReturnType<typeof setTimeout> => {
    const id = setTimeout(() => {
      activeTimeouts.delete(id)
      callback()
    }, delay)

    activeTimeouts.add(id)
    return id
  }

  const cancelTimeout = (id: ReturnType<typeof setTimeout>): void => {
    clearTimeout(id)
    activeTimeouts.delete(id)
  }

  const cancelAll = (): void => {
    for (const id of activeTimeouts) clearTimeout(id)
    activeTimeouts.clear()
  }

  if (getCurrentScope()) onScopeDispose(cancelAll)

  return { createTimeout, cancelTimeout, cancelAll }
}
