import { type Ref, ref, computed, onMounted, onUnmounted, watchEffect } from 'vue'

type PopupState =
  | { type: 'closed' }
  | { type: 'dropdown'; ids: symbol[] } // Stack of open dropdown IDs
  | { type: 'preview' }

const popupState = ref<PopupState>({ type: 'closed' })
const rootElements = new Map<symbol, HTMLElement>()
let activeDropdownCount = 0

function globalClickHandler(event: MouseEvent) {
  const target = event.target as HTMLElement

  for (const element of rootElements.values()) {
    if (element.contains(target)) return
  }

  popupState.value = { type: 'closed' }
}

function ensureListener() {
  if (activeDropdownCount === 0) {
    document.addEventListener('click', globalClickHandler)
  }
  activeDropdownCount++
}

function cleanupListener() {
  activeDropdownCount--
  if (activeDropdownCount === 0) {
    document.removeEventListener('click', globalClickHandler)
  }
}

export interface DropdownController {
  readonly isOpen: Readonly<Ref<boolean>>
  readonly containerRef: Ref<HTMLElement | undefined>
  toggle(): void
  close(): void
}

export function useDropdown(options?: { nested?: boolean }): DropdownController {
  const dropdownId = Symbol('dropdown-id')
  // TODO Check if I can use useTemplate()
  const containerRef = ref<HTMLElement>()
  const isNested = options?.nested ?? false

  const isOpen = computed(() => {
    if (popupState.value.type !== 'dropdown') return false
    return popupState.value.ids.includes(dropdownId)
  })

  function toggle() {
    if (isOpen.value) {
      close()
    } else {
      if (isNested && popupState.value.type === 'dropdown') {
        popupState.value = {
          type: 'dropdown',
          ids: [...popupState.value.ids, dropdownId],
        }
      } else {
        popupState.value = { type: 'dropdown', ids: [dropdownId] }
      }
    }
  }

  function close() {
    if (popupState.value.type !== 'dropdown') return

    const index = popupState.value.ids.indexOf(dropdownId)
    if (index === -1) return

    const newIds = popupState.value.ids.slice(0, index)
    popupState.value = newIds.length > 0 ? { type: 'dropdown', ids: newIds } : { type: 'closed' }
  }

  onMounted(() => {
    ensureListener()
  })

  watchEffect(() => {
    if (containerRef.value) {
      rootElements.set(dropdownId, containerRef.value)
    }
  })

  onUnmounted(() => {
    rootElements.delete(dropdownId)
    cleanupListener()
  })

  return { isOpen, containerRef, toggle, close }
}

export interface PreviewController {
  readonly isOpen: Readonly<Ref<boolean>>
  readonly containerRef: Ref<HTMLElement | undefined>
  open(): void
  close(): void
}

export function usePreview(): PreviewController {
  // TODO Check if I can use useTemplate()
  const containerRef = ref<HTMLElement>()
  const previewId = Symbol('preview-id')

  const isOpen = computed(() => popupState.value.type === 'preview')

  function open() {
    popupState.value = { type: 'preview' }
  }

  function close() {
    if (isOpen.value) popupState.value = { type: 'closed' }
  }

  onMounted(() => {
    ensureListener()
  })

  watchEffect(() => {
    if (containerRef.value) {
      rootElements.set(previewId, containerRef.value)
    }
  })

  onUnmounted(() => {
    rootElements.delete(previewId)
    cleanupListener()
  })

  return { isOpen, containerRef, open, close }
}
