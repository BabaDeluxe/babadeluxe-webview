import { type Ref, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'

interface DropdownController {
  readonly isOpen: Readonly<Ref<boolean>>
  readonly containerRef: Ref<HTMLElement | undefined>
  toggle(): void
  close(): void
}

export function useDropdown(): DropdownController {
  const isOpen = ref(false)
  const containerRef = ref<HTMLElement>()

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  onClickOutside(containerRef, () => {
    if (isOpen.value) close()
  })

  return { isOpen, containerRef, toggle, close }
}
