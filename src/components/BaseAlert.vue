<template>
  <div
    v-if="message"
    class="px-4 pb-4"
  >
    <div
      class="bg-panel border rounded-lg p-3 flex items-center justify-between"
      :class="borderAndIconClass"
    >
      <div
        class="flex items-center gap-2 text-sm"
        :class="textColorClass"
      >
        <i :class="iconClass" />
        <span>{{ message }}</span>
      </div>
      <BaseButton
        v-if="isDismissible"
        icon="i-weui:close-outlined"
        :class="`bg-transparent hover:bg-transparent rounded-none border-0 ${textColorClass}`"
        data-testid="alert-close-button"
        @click="handleClose"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue'
import BaseButton from '@/components/BaseButton.vue'

type ErrorType = 'error' | 'warning'

interface Props {
  message?: string
  type?: ErrorType
  isDismissible?: boolean
  autoDismissMs?: number
}

interface Emits {
  (event: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  message: undefined,
  type: 'error',
  isDismissible: true,
  autoDismissMs: 5000,
})

const emit = defineEmits<Emits>()

const timeoutId = ref<number | undefined>()

const clearAutoDismiss = () => {
  if (timeoutId.value !== undefined) {
    clearTimeout(timeoutId.value)
    timeoutId.value = undefined
  }
}

const scheduleAutoDismiss = () => {
  clearAutoDismiss()
  if (!props.message || !props.autoDismissMs || props.autoDismissMs <= 0) return
  timeoutId.value = window.setTimeout(() => {
    emit('close')
    timeoutId.value = undefined
  }, props.autoDismissMs)
}

const handleClose = () => {
  clearAutoDismiss()
  emit('close')
}

onMounted(() => {
  scheduleAutoDismiss()
})

onBeforeUnmount(() => {
  clearAutoDismiss()
})

watch(
  () => props.message,
  () => {
    scheduleAutoDismiss()
  }
)

const borderAndIconClass = {
  error: 'border-error',
  warning: 'border-warning',
}[props.type]

const textColorClass = {
  error: 'text-error',
  warning: 'text-warning',
}[props.type]

const iconClass = {
  error: 'i-ant-design:info-circle-outlined',
  warning: 'i-ant-design:warning-outlined',
}[props.type]
</script>
