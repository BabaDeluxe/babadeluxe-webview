import { onMounted, onUnmounted, ref, type Ref } from 'vue'

const scrollThresholdPx = 120
const atBottomTolerancePx = 24

export function useScrollToBottom(scrollContainer: Ref<HTMLElement | undefined | null>) {
  const isVisible = ref(false)

  function updateVisibility() {
    const el = scrollContainer.value
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isVisible.value = el.scrollTop > scrollThresholdPx && distanceFromBottom > atBottomTolerancePx
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
