<template>
  <div
    ref="containerRef"
    class="relative flex flex-col w-auto"
  >
    <div
      class="flex items-center gap-2 px-2 py-2 cursor-pointer hover:text-accent transition-colors"
      @click="toggle"
    >
      <slot>
        <i
          :class="icon"
          class="text-base text-subtleText"
        />
        <span class="text-sm text-deepText">{{ currentLabel }}</span>
        <i class="i-weui:arrow-outlined rotate-90 text-base transform text-subtleText" />
      </slot>
    </div>

    <div
      v-if="isOpen"
      class="bg-panel border border-borderMuted rounded shadow-lg z-50 min-w-[200px]"
      :class="menuPosClass"
    >
      <!-- Flat items (backward compatible) -->
      <template v-if="!properties.groups">
        <div
          v-for="option in normalized"
          :key="option.value"
          class="px-4 py-2 hover:bg-slate cursor-pointer text-sm text-deepText transition-colors flex items-center gap-2"
          :class="{ 'bg-slate': option.value === modelValue }"
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

      <!-- Grouped items -->
      <template v-else>
        <div
          v-for="(group, index) in properties.groups"
          :key="group.label"
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
            :class="{ 'bg-slate': option.value === modelValue }"
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
import { useDropdown } from '@/composables/use-dropdown-state'

interface Item {
  value: string
  label: string
  icon?: string
}

interface ItemGroup {
  label: string
  items: Item[]
}

interface Properties {
  modelValue: string
  icon: string
  options?: string[]
  items?: Item[]
  groups?: ItemGroup[]
  placement?: 'bottom' | 'right'
}

interface Emits {
  (event: 'update:modelValue', value: string): void
}

const properties = withDefaults(defineProps<Properties>(), {
  placement: 'bottom',
  options: undefined,
  items: undefined,
  groups: undefined,
})
const emit = defineEmits<Emits>()

const { isOpen, containerRef, toggle, close } = useDropdown({ nested: true })

const normalized = computed<Item[]>(
  () =>
    properties.items?.map((item) => ({ value: item.value, label: item.label, icon: item.icon })) ??
    (properties.options ?? []).map((item) => ({ value: item, label: item }))
)

const currentLabel = computed(() => {
  if (properties.groups) {
    for (const group of properties.groups) {
      const found = group.items.find((item) => item.value === properties.modelValue)
      if (found) return found.label
    }
  }
  return (
    normalized.value.find((item) => item.value === properties.modelValue)?.label ??
    properties.modelValue
  )
})

const menuPosClass = computed(() =>
  properties.placement === 'right' ? 'left-full top-0 ml-1' : 'left-0 mt-1'
)

function selectOption(value: string) {
  emit('update:modelValue', value)
  close()
}
</script>
