<template>
  <div
    v-if="message"
    class="px-4 pb-4"
  >
    <div
      class="bg-panel border rounded-md p-3 flex items-center justify-between"
      :class="borderAndIconClass"
    >
      <div
        class="flex items-center gap-2 text-sm"
        :class="textColorClass"
      >
        <i :class="iconClass" />
        <span>{{ message }}</span>
      </div>
      <ButtonItem
        icon="i-weui:close-outlined"
        :class="`bg-transparent hover:bg-transparent rounded-none border-0 ${textColorClass}`"
        @click="emit('close')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ButtonItem from '@/components/ButtonItem.vue'

type ErrorType = 'error' | 'warning'

interface Props {
  message?: string
  type?: ErrorType
}

interface Emits {
  (event: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  message: undefined,
  type: 'error',
})

const emit = defineEmits<Emits>()

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
