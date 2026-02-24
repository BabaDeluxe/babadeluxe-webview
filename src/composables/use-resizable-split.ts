import { ref, computed, onMounted, useTemplateRef } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { KeyValueStore } from '@/database/key-value-store'

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

    // Case 1: Database error - use default
    if (result.isErr()) {
      leftWidth.value = defaultRatio
      return
    }

    const saved = result.value

    // Case 2: No value stored - use default
    if (saved === undefined) {
      leftWidth.value = defaultRatio
      saveRatio(leftWidth.value)
      return
    }

    // Case 3: Validate stored value
    const parsed = Number(saved)
    if (Number.isNaN(parsed) || parsed < minRatio || parsed > maxRatio) {
      leftWidth.value = defaultRatio
      saveRatio(leftWidth.value)
      return
    }

    // Case 4: Valid stored value
    leftWidth.value = parsed
    saveRatio(leftWidth.value)
  }

  const saveRatio = async (ratio: number) => {
    await keyValueStore.set(storageKey, String(ratio))
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
