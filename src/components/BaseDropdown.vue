<template>
  <div
    ref="dropdownContainerRef"
    :class="['relative flex flex-col', props.isFullWidth ? 'w-full' : 'w-auto']"
  >
    <div
      :class="[
        'transition-colors',
        props.isFullWidth ? 'w-full' : '',
        props.triggerClass ?? 'flex items-center gap-2 p-1 text-subtleText hover:text-accent',
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
              <div
                v-for="option in flatItems"
                :key="option.value"
                class="px-4 py-2 text-sm text-deepText transition-colors flex items-center gap-2"
                :class="[
                  option.value === props.modelValue ? 'bg-slate' : 'hover:bg-slate',
                  option.isDisabled ? 'opacity-60 cursor-default' : 'cursor-pointer',
                ]"
                @click="!option.isDisabled && selectOption(option.value)"
              >
                <i
                  v-if="option.icon"
                  :class="option.icon"
                  class="text-xs"
                  aria-hidden="true"
                />
                <span>{{ option.label }}</span>
              </div>
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
                <div
                  v-for="option in group.items"
                  :key="option.value"
                  class="px-6 py-2 text-sm text-deepText transition-colors flex items-center gap-2"
                  :class="[
                    option.value === props.modelValue ? 'bg-slate' : 'hover:bg-slate',
                    option.isDisabled ? 'opacity-60 cursor-default' : 'cursor-pointer',
                  ]"
                  @click="!option.isDisabled && selectOption(option.value)"
                >
                  <i
                    v-if="option.icon"
                    :class="option.icon"
                    class="text-xs"
                    aria-hidden="true"
                  />
                  <div class="flex flex-col">
                    <span>{{ option.label }}</span>
                    <span class="text-xs text-subtleText">
                      {{ option.value.split(':')[0] }}
                    </span>
                  </div>
                </div>
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
  triggerClass?: string
  isFullWidth?: boolean
  isDisabled?: boolean
}

const props = withDefaults(defineProps<DropdownProps>(), {
  placement: 'bottom',
  options: undefined,
  items: undefined,
  groups: undefined,
  triggerClass: undefined,
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
