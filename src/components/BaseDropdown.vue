<template>
  <div
    ref="dropdownContainerRef"
    :class="['relative flex flex-col', props.isFullWidth ? 'w-full' : 'w-auto']"
  >
    <div
      :class="[
        'flex items-center gap-2 px-3 py-2 rounded-lg text-subtleText',
        'hover:text-deepText hover:bg-borderMuted/20 transition-colors',
        props.isFullWidth ? 'w-full' : 'w-auto',
        props.isDisabled ? 'cursor-default opacity-60' : 'cursor-pointer',
      ]"
      :aria-disabled="props.isDisabled || undefined"
      @click="!props.isDisabled && toggle()"
    >
      <slot>
        <i
          :class="props.icon"
          class="text-base"
          aria-hidden="true"
        />
        <!-- Text label hidden below 568px (mobile) -->
        <span class="hidden mobile:inline text-sm">
          {{ selectedLabel }}
        </span>
        <i
          class="i-bi:chevron-right rotate-90 text-base transform"
          aria-hidden="true"
        />
      </slot>
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        data-dropdown-layer="true"
        class="bg-panel border border-borderMuted rounded-lg shadow-lg z-50 min-w-[200px] fixed overflow-hidden flex flex-col"
        :style="menuPositionStyle"
      >
        <div class="overflow-y-auto max-h-[400px]">
          <!-- Flat items (no groups) -->
          <template v-if="!props.groups">
            <template v-if="flatItems.length">
              <BaseDropdownItem
                v-for="option in flatItems"
                :key="option.value"
                :value="option.value"
                :label="option.label"
                :icon="option.icon"
                :is-active="option.value === props.modelValue"
                :is-disabled="option.isDisabled"
                @select="selectOption"
              />
            </template>
            <div
              v-else
              class="px-4 py-3 text-sm text-subtleText text-center"
            >
              No prompts available.
            </div>
          </template>

          <!-- Grouped items -->
          <template v-else>
            <template v-if="props.groups.length === 0">
              <div class="px-4 py-3 text-sm text-subtleText text-center">
                No models available. Configure API keys in settings.
              </div>
            </template>

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
                <BaseDropdownItem
                  v-for="option in group.items"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                  :icon="option.icon"
                  :subtitle="option.value.split(':')[0]"
                  :is-active="option.value === props.modelValue"
                  :is-disabled="option.isDisabled"
                  item-class="px-6"
                  @select="selectOption"
                />
              </div>
            </template>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDropdown } from '@/composables/use-dropdown'
import { useTeleportedMenuPosition } from '@/composables/use-teleported-menu-position'
import BaseDropdownItem from './BaseDropdownItem.vue'

export interface DropdownItem {
  value: string
  label: string
  isDisabled: boolean
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
  placement?: 'bottom' | 'right' | 'top'
  isFullWidth?: boolean
  isDisabled?: boolean
}

const props = withDefaults(defineProps<DropdownProps>(), {
  placement: 'bottom',
  options: undefined,
  items: undefined,
  groups: undefined,
  isFullWidth: false,
  isDisabled: false,
})

interface DropdownEmits {
  (event: 'update:modelValue', value: string): void
}

const emit = defineEmits<DropdownEmits>()

const menuRef = ref<HTMLElement | undefined>(undefined)

const {
  isOpen,
  containerRef: dropdownContainerRef,
  toggle,
  close,
} = useDropdown({
  ignore: [menuRef],
})

const placementRef = computed(() => props.placement)

const { menuPositionStyle } = useTeleportedMenuPosition({
  triggerRef: dropdownContainerRef,
  menuRef,
  isOpen,
  placement: placementRef,
})

const flatItems = computed<DropdownItem[]>(
  () =>
    props.items?.map((item) => ({
      value: item.value,
      label: item.label,
      icon: item.icon,
      isDisabled: item.isDisabled ?? false,
    })) ??
    (props.options ?? []).map((value) => ({
      value,
      label: value,
      isDisabled: false,
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

function selectOption(value: string): void {
  emit('update:modelValue', value)
  close()
}

defineExpose({ close })
</script>
