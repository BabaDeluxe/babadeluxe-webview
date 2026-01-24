import { ref, computed, onMounted, inject, useTemplateRef } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { ConsoleLogger } from '@simwai/utils'
import type { KeyValueStore } from '@/database/key-value-store'
import { LOGGER_KEY } from '@/injection-keys'

type UseResizableSplitOptions = {
  keyValueStore: KeyValueStore
  storageKey: string
  refKey: string
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
    refKey,
    defaultRatio,
    minRatio,
    maxRatio,
    direction = 'horizontal',
  } = _options

  const leftWidth = ref<number>(defaultRatio)
  const isDragging = ref(false)
  const containerRef = useTemplateRef<HTMLElement>(refKey)

  const leftWidthPercent = computed(() => `${leftWidth.value}%`)
  const rightWidthPercent = computed(() => `${100 - leftWidth.value}%`)

  const loadSavedRatio = async () => {
    const result = await keyValueStore.get(storageKey)

    // Case 1: Database error
    if (result.isErr()) {
      _logger.error('Failed to load split ratio from storage:', result.error)
      leftWidth.value = defaultRatio
      return
    }

    const saved = result.value

    // Case 2: No value stored (first use) - silently use default
    if (saved === undefined) {
      leftWidth.value = defaultRatio
      saveRatio(leftWidth.value)
      return
    }

    // Case 3: Validate stored value
    const parsed = Number(saved)
    if (Number.isNaN(parsed) || parsed < minRatio || parsed > maxRatio) {
      _logger.warn(
        `Invalid split ratio "${saved}" (expected ${minRatio}-${maxRatio}), using default ${defaultRatio}%`
      )
      leftWidth.value = defaultRatio
      saveRatio(leftWidth.value)
      return
    }

    // Case 4: Valid stored value
    leftWidth.value = parsed
    saveRatio(leftWidth.value)
  }

  const saveRatio = async (ratio: number) => {
    const result = await keyValueStore.set(storageKey, String(ratio))
    if (result.isErr()) {
      _logger.error('Failed to save split ratio:', result.error)
    }
  }

  const startDragging = (event?: PointerEvent) => {
    isDragging.value = true

    const handleElement = event?.currentTarget
    if (handleElement instanceof HTMLElement && typeof event?.pointerId === 'number') {
      handleElement.setPointerCapture(event.pointerId)
    }
  }

  const stopDragging = async () => {
    if (isDragging.value) {
      isDragging.value = false
      await saveRatio(leftWidth.value)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging.value || !containerRef.value) return

    const container = containerRef.value.getBoundingClientRect()

    const offset =
      direction === 'horizontal' ? event.clientX - container.left : event.clientY - container.top

    const size = direction === 'horizontal' ? container.width : container.height

    const percentage = (offset / size) * 100

    const clampedPercentage = Math.max(minRatio, Math.min(maxRatio, percentage))
    leftWidth.value = clampedPercentage
  }

  useEventListener(document, 'pointermove', onPointerMove)
  useEventListener(document, 'pointerup', stopDragging)
  useEventListener(document, 'pointercancel', stopDragging)

  onMounted(async () => {
    await loadSavedRatio()
  })

  return {
    leftWidth,
    leftWidthPercent,
    rightWidthPercent,
    isDragging,
    startDragging,
  }
}
