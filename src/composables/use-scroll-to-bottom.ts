import { onMounted, onUnmounted, ref, type Ref } from 'vue'

const SCROLL_THRESHOLD_PX = 120
const AT_BOTTOM_TOLERANCE_PX = 24

export function useScrollToBottom(scrollContainer: Ref<HTMLElement | undefined>) {
  const isVisible = ref(false)

  function updateVisibility() {
    const el = scrollContainer.value
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const hasScrolledEnough = el.scrollTop > SCROLL_THRESHOLD_PX
    const isAtBottom = distanceFromBottom <= AT_BOTTOM_TOLERANCE_PX

    isVisible.value = hasScrolledEnough && !isAtBottom
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

  onUnmounted(() => {
    scrollContainer.value?.removeEventListener('scroll', updateVisibility)
  })

  return { isVisible, scrollToBottom, updateVisibility }
}
