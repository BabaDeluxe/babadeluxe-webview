import { ref, computed, onMounted, inject } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { ConsoleLogger } from '@simwai/utils'
import type { KeyValueStore } from '@/database/key-value-store'
import { LOGGER_KEY } from '@/injection-keys'

type UseResizableSplitOptions = {
  keyValueStore: KeyValueStore
  storageKey: string
  defaultRatio: number
  minRatio: number
  maxRatio: number
  direction?: 'horizontal' | 'vertical'
}

export const useResizableSplit = (_options: UseResizableSplitOptions) => {
  const _logger: ConsoleLogger = inject(LOGGER_KEY)!

  const {
    keyValueStore,
    storageKey,
    defaultRatio,
    minRatio,
    maxRatio,
    direction = 'horizontal',
  } = _options

  const leftWidth = ref<number>(defaultRatio)
  const isDragging = ref(false)
  // TODO Check if I can use useTemplate()
  const containerRef = ref<HTMLElement | undefined>()

  const leftWidthPercent = computed(() => `${leftWidth.value}%`)
  const rightWidthPercent = computed(() => `${100 - leftWidth.value}%`)

  const loadSavedRatio = async () => {
    const saved = await keyValueStore.get(storageKey)

    if (saved) {
      const parsed = Number(saved)
      if (!Number.isNaN(parsed) && parsed >= minRatio && parsed <= maxRatio) {
        leftWidth.value = parsed
      }

      return
    }

    _logger.error('Failed to load split ratio from key value store')
  }

  const saveRatio = async (ratio: number) => {
    try {
      await keyValueStore.set(storageKey, String(ratio))
    } catch (error) {
      _logger.error('Failed to save split ratio:', error as Error)
    }
  }

  const startDragging = () => {
    isDragging.value = true
  }

  const stopDragging = async () => {
    if (isDragging.value) {
      isDragging.value = false
      await saveRatio(leftWidth.value)
    }
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging.value || !containerRef.value) return

    const container = containerRef.value.getBoundingClientRect()

    const offset =
      direction === 'horizontal' ? event.clientX - container.left : event.clientY - container.top

    const size = direction === 'horizontal' ? container.width : container.height

    const percentage = (offset / size) * 100

    const clampedPercentage = Math.max(minRatio, Math.min(maxRatio, percentage))
    leftWidth.value = clampedPercentage
  }

  useEventListener(document, 'mousemove', onMouseMove)
  useEventListener(document, 'mouseup', stopDragging)

  onMounted(async () => {
    await loadSavedRatio()
  })

  return {
    containerRef,
    leftWidth,
    leftWidthPercent,
    rightWidthPercent,
    isDragging,
    startDragging,
  }
}
