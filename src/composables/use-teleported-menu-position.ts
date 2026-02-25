import { computed, nextTick, ref, watch, type CSSProperties, type Ref } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'

export type TeleportedMenuPlacement = 'bottom' | 'top' | 'right'

export interface UseTeleportedMenuPositionOptions {
  readonly triggerRef: Ref<HTMLElement | undefined>
  readonly menuRef: Ref<HTMLElement | undefined>
  readonly isOpen: Readonly<Ref<boolean>>
  readonly placement: Readonly<Ref<TeleportedMenuPlacement>>

  readonly maxHeightPixels?: number
  readonly gapPixels?: number
  readonly viewportPaddingPixels?: number
}

export interface TeleportedMenuPositionController {
  readonly menuPositionStyle: Readonly<Ref<CSSProperties>>
  updateMenuPosition(): void
}

export function useTeleportedMenuPosition(
  options: UseTeleportedMenuPositionOptions
): TeleportedMenuPositionController {
  const maxHeightPixels = computed(() => options.maxHeightPixels ?? 400)
  const gapPixels = computed(() => options.gapPixels ?? 4)
  const viewportPaddingPixels = computed(() => options.viewportPaddingPixels ?? 8)

  const menuPositionStyle = ref<CSSProperties>({})

  function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value) || max < min) return min
    return Math.min(Math.max(value, min), max)
  }

  function updateMenuPosition(): void {
    const triggerElement = options.triggerRef.value
    const menuElement = options.menuRef.value
    if (!triggerElement || !menuElement) return

    const triggerRect = triggerElement.getBoundingClientRect()
    const menuRect = menuElement.getBoundingClientRect()

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const gap = gapPixels.value
    const viewportPadding = viewportPaddingPixels.value

    let top = triggerRect.bottom + gap
    let left = triggerRect.left

    if (options.placement.value === 'top') {
      top = triggerRect.top - menuRect.height - gap
      left = triggerRect.left
    }

    if (options.placement.value === 'right') {
      top = triggerRect.top
      left = triggerRect.right + gap

      const wouldOverflowRight = left + menuRect.width + viewportPadding > viewportWidth
      if (wouldOverflowRight) {
        left = triggerRect.left - menuRect.width - gap
      }
    }

    const maxLeft = viewportWidth - menuRect.width - viewportPadding
    const maxTop = viewportHeight - menuRect.height - viewportPadding

    top = clamp(top, viewportPadding, maxTop)
    left = clamp(left, viewportPadding, maxLeft)

    const availableHeight = Math.max(0, viewportHeight - top - viewportPadding)

    menuPositionStyle.value = {
      top: `${top}px`,
      left: `${left}px`,
      maxHeight: `${Math.min(maxHeightPixels.value, availableHeight)}px`,
    }
  }

  watch(
    () => options.isOpen.value,
    async (newIsOpen) => {
      if (!newIsOpen) return
      await nextTick()
      await nextTick()
      updateMenuPosition()
    }
  )

  useEventListener(
    window,
    'scroll',
    () => {
      updateMenuPosition()
    },
    { capture: true }
  )
  useEventListener(window, 'resize', () => {
    updateMenuPosition()
  })

  useResizeObserver(options.menuRef, () => {
    if (!options.isOpen.value) return
    updateMenuPosition()
  })

  return { menuPositionStyle, updateMenuPosition }
}
