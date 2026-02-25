import { computed, type Ref, ref } from 'vue'
import { onClickOutside, type OnClickOutsideOptions } from '@vueuse/core'

interface DropdownController {
  readonly isOpen: Readonly<Ref<boolean>>
  readonly containerRef: Ref<HTMLElement | undefined>
  toggle(): void
  close(): void
}

export interface UseDropdownOptions {
  readonly ignore?: ReadonlyArray<unknown>
}

export function useDropdown(options: UseDropdownOptions = {}): DropdownController {
  const isOpen = ref(false)
  const containerRef = ref<HTMLElement>()

  const ignore = computed<ReadonlyArray<unknown>>(() => [
    '[data-dropdown-layer="true"]',
    ...(options.ignore ?? []),
  ])

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  onClickOutside(
    containerRef,
    () => {
      if (isOpen.value) close()
    },
    { ignore } as OnClickOutsideOptions
  )

  return { isOpen, containerRef, toggle, close }
}
