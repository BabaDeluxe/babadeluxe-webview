<template>
  <div
    ref="dropdownContainerRef"
    :class="['relative flex flex-col', props.fullWidth ? 'w-full' : 'w-auto']"
  >
    <div
      :class="[
        'cursor-pointer transition-colors',
        props.fullWidth ? 'w-full' : '',
        props.triggerClass || 'flex items-center gap-2 p-1 text-subtleText hover:text-accent',
      ]"
      @click="toggle"
    >
      <slot>
        <i
          :class="props.icon"
          class="text-base"
        />
        <span class="text-sm">{{ selectedLabel }}</span>
        <i class="i-weui:arrow-outlined rotate-90 text-base transform" />
      </slot>
    </div>

    <div
      v-if="isOpen"
      class="bg-panel border border-borderMuted rounded shadow-lg z-50 min-w-[200px]"
      :class="menuPositionClass"
    >
      <!-- Flat items (backward compatible) -->
      <template v-if="!props.groups">
        <div
          v-for="option in flatItems"
          :key="option.value"
          class="px-4 py-2 hover:bg-slate cursor-pointer text-sm text-deepText transition-colors flex items-center gap-2"
          :class="{ 'bg-slate': option.value === props.modelValue }"
          @click="selectOption(option.value)"
        >
          <i
            v-if="option.icon"
            :class="option.icon"
            class="text-xs"
          />
          <span>{{ option.label }}</span>
        </div>
      </template>

      <!-- Empty state when groups exist but are empty -->
      <template v-else-if="props.groups.length === 0">
        <div class="px-4 py-3 text-sm text-subtleText text-center">
          No models available. Configure API keys in settings.
        </div>
      </template>

      <!-- Grouped items -->
      <template v-else>
        <div
          v-for="(group, index) in props.groups"
          :key="group.label"
          :data-testid="`dropdown-item-${index}`"
        >
          <div
            v-if="index > 0"
            class="border-t border-borderMuted"
          />
          <div class="px-4 py-2 text-xs text-subtleText font-semibold bg-slate">
            {{ group.label }}
          </div>
          <div
            v-for="option in group.items"
            :key="option.value"
            class="px-6 py-2 hover:bg-slate cursor-pointer text-sm text-deepText transition-colors flex items-center gap-2"
            :class="{ 'bg-slate': option.value === props.modelValue }"
            @click="selectOption(option.value)"
          >
            <i
              v-if="option.icon"
              :class="option.icon"
              class="text-xs"
            />
            <div class="flex flex-col">
              <span>{{ option.label }}</span>
              <span class="text-xs text-subtleText">{{ option.value.split(':')[0] }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDropdown } from '@/composables/use-dropdown'

export interface DropdownItem {
  value: string
  label: string
  disabled: boolean
  icon?: string
}

export interface DropdownGroup {
  label: string
  items: DropdownItem[]
}

interface DropdownProps {
  modelValue: string
  icon: string
  options?: string[]
  items?: DropdownItem[]
  groups?: DropdownGroup[]
  placement?: 'bottom' | 'right'
  triggerClass?: string
  fullWidth?: boolean
}

const props = withDefaults(defineProps<DropdownProps>(), {
  placement: 'bottom',
  options: undefined,
  items: undefined,
  groups: undefined,
  triggerClass: '',
  fullWidth: false,
})

interface DropdownEmits {
  (event: 'update:modelValue', value: string): void
}

const emit = defineEmits<DropdownEmits>()

const { isOpen, containerRef: dropdownContainerRef, toggle, close } = useDropdown()

const flatItems = computed<DropdownItem[]>(
  () =>
    props.items?.map((item) => ({
      value: item.value,
      label: item.label,
      icon: item.icon,
      disabled: item.disabled ?? false, // ensure boolean
    })) ??
    (props.options ?? []).map((value) => ({
      value,
      label: value,
      disabled: false, // flat options are enabled by default
    }))
)

const selectedLabel = computed(() => {
  if (props.groups) {
    for (const group of props.groups) {
      const found = group.items.find((item) => item.value === props.modelValue)
      if (found) return found.label
    }
  }
  return flatItems.value.find((item) => item.value === props.modelValue)?.label ?? props.modelValue
})

const menuPositionClass = computed(() =>
  props.placement === 'right' ? 'left-full top-0 ml-1' : 'left-0 mt-1'
)

function selectOption(value: string) {
  emit('update:modelValue', value)
  close()
}
</script>
