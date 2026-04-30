<template>
  <div class="flex flex-col gap-1.5">
    <!-- Label -->
    <label
      v-if="label"
      :for="inputId"
      class="text-sm text-subtleText"
    >
      {{ label }}
      <span
        v-if="!isRequired"
        class="text-xs text-subtleText/70"
      >
        (optional)
      </span>
    </label>

    <!-- Input Wrapper (for password toggle button) -->
    <div class="relative flex items-center gap-2">
      <!-- Main Input -->
      <input
        :id="inputId"
        ref="inputRef"
        :type="computedType"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :maxlength="maxlength"
        :aria-required="isRequired"
        :aria-invalid="validationState === 'invalid'"
        :aria-describedby="errorId"
        :data-testid="testId"
        :class="inputClasses"
        v-bind="$attrs"
        @input="handleInput"
        @blur="emit('blur', $event)"
        @focus="emit('focus', $event)"
      />

      <!-- Password Toggle Button -->
      <BaseButton
        v-if="type === 'password' && isToggleable"
        variant="icon"
        type="button"
        :aria-label="showPassword ? 'Hide password' : 'Show password'"
        tabindex="-1"
        class="absolute right-2 text-white/50 hover:text-white transition-colors"
        @click="togglePassword"
      >
        {{ showPassword ? '🙈' : '👁️' }}
      </BaseButton>

      <!-- Validation Status Indicator -->
      <span
        v-if="validationState === 'validating'"
        class="text-sm text-subtleText whitespace-nowrap flex-shrink-0"
        aria-live="polite"
      >
        Validating...
      </span>
      <span
        v-else-if="validationState === 'valid'"
        class="text-accent text-lg flex-shrink-0"
        aria-label="Valid"
      >
        ✓
      </span>
    </div>

    <!-- Error Message -->
    <span
      v-if="error"
      :id="errorId"
      role="alert"
      class="text-error text-xs"
    >
      {{ error }}
    </span>

    <!-- Helper Text -->
    <span
      v-if="helperText && !error"
      class="text-xs text-subtleText"
    >
      {{ helperText }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useId } from 'vue'
import BaseButton from '@/components/BaseButton.vue'

type ValidationState = 'idle' | 'validating' | 'valid' | 'invalid'

interface BaseInputProps {
  modelValue: string | number
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'tel'
  label?: string
  placeholder?: string
  error?: string
  helperText?: string
  isDisabled?: boolean
  isRequired?: boolean
  maxlength?: number
  validationState?: ValidationState
  isToggleable?: boolean
  testId?: string
}

const props = withDefaults(defineProps<BaseInputProps>(), {
  type: 'text',
  label: undefined,
  placeholder: undefined,
  error: undefined,
  helperText: undefined,
  isDisabled: false,
  isRequired: false,
  maxlength: undefined,
  validationState: 'idle',
  isToggleable: true,
  testId: undefined,
})

defineOptions({
  inheritAttrs: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  blur: [event: FocusEvent]
  focus: [event: FocusEvent]
}>()

const inputId = useId()
const errorId = computed(() => `${inputId}-error`)
const showPassword = ref(false)
const inputRef = ref<HTMLInputElement>()

const computedType = computed(() => {
  if (props.type === 'password' && props.isToggleable) {
    return showPassword.value ? 'text' : 'password'
  }
  return props.type
})

const inputClasses = computed(() => {
  const base =
    'w-full px-3 py-2.5 rounded-lg bg-panel text-white placeholder-subtleText/50 focus:outline-none transition-all'

  let borderClasses = ''
  if (props.validationState === 'invalid' || props.error) {
    borderClasses = 'border border-error/50 focus:border-error shadow-[0_0_10px_rgba(231,76,92,0.1)]'
  } else if (props.validationState === 'valid') {
    borderClasses = 'border border-accent/50 focus:border-accent'
  } else {
    borderClasses = 'border border-borderMuted focus:border-accent focus:shadow-[0_0_15px_rgba(182,126,230,0.15)]'
  }

  const disabledClass = props.isDisabled ? 'opacity-50 cursor-not-allowed' : ''

  return `${base} ${borderClasses} ${disabledClass}`
})

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = props.type === 'number' ? Number(target.value) : target.value
  emit('update:modelValue', value)
}

function togglePassword() {
  showPassword.value = !showPassword.value
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
})
</script>
