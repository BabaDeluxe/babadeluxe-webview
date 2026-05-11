import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/* eslint-disable @typescript-eslint/naming-convention */
const SCROLL_THRESHOLD_PX = 120
const AT_BOTTOM_TOLERANCE_PX = 24
/* eslint-enable @typescript-eslint/naming-convention */

export function useScrollToBottom(scrollContainer: Ref<HTMLElement | undefined | null>) {
  const isVisible = ref(false)

  function updateVisibility() {
    const el = scrollContainer.value
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isVisible.value = el.scrollTop > SCROLL_THRESHOLD_PX && distanceFromBottom > AT_BOTTOM_TOLERANCE_PX
  }

  function scrollToBottom() {
    const el = scrollContainer.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  onMounted(() => {
    const el = scrollContainer.value
    if (!el) return
    el.addEventListener('scroll', updateVisibility, { passive: true })
    updateVisibility()
  })

  // Top-level — NOT inside onMounted. Nested onUnmounted is a Vue no-op.
  onUnmounted(() => {
    scrollContainer.value?.removeEventListener('scroll', updateVisibility)
  })

  return { isVisible, scrollToBottom, updateVisibility }
}
