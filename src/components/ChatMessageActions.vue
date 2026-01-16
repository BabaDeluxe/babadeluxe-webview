<template>
  <BaseDropdownMenu
    trigger-test-id="message-menu-button"
    menu-test-id="message-menu-dropdown"
  >
    <template #default="{ close }">
      <!-- USER MESSAGES: Edit + Rewrite + Delete -->
      <template v-if="role === 'user'">
        <button
          class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2.5 first:rounded-t-lg"
          data-testid="message-edit-button"
          @click="handleEdit(close)"
        >
          <i class="i-weui:pencil-outlined text-base" />
          <span>Edit Message</span>
        </button>

        <!-- Rewrite for USER messages (conditionally shown) -->
        <template v-if="showRewrite">
          <div class="border-t border-borderMuted my-1" />

          <BaseDropdown
            :model-value="selectedModel"
            icon="i-fluent:arrow-repeat"
            :groups="modelGroups"
            :disabled="isLoadingModels"
            placement="right"
            data-testid="message-rewrite-selector"
            full-width
            trigger-class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-deepText transition-colors flex items-center gap-2.5 justify-between cursor-pointer"
            @update:model-value="(modelId) => handleRewrite(modelId, close)"
          >
            <div class="flex items-center gap-2.5">
              <i class="i-fluent:arrow-repeat text-base" />
              <span v-if="isLoadingModels">Loading models...</span>
              <span v-else-if="modelsError">Error loading models</span>
              <span v-else>Rewrite with...</span>
            </div>
            <i class="i-weui:arrow-outlined rotate-90 text-xs opacity-50" />
          </BaseDropdown>
        </template>

        <div class="border-t border-borderMuted my-1" />
      </template>

      <!-- Delete button for both roles -->
      <button
        class="w-full px-3 py-2.5 text-left text-sm hover:bg-codeBg text-subtleText hover:text-error transition-colors flex items-center gap-2.5 last:rounded-b-lg"
        data-testid="message-delete-button"
        @click="handleDelete(close)"
      >
        <i class="i-weui:delete-outlined text-base" />
        <span>Delete Message</span>
      </button>
    </template>
  </BaseDropdownMenu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseDropdownMenu from '@/components/BaseDropdownMenu.vue'
import BaseDropdown, { type DropdownGroup } from '@/components/BaseDropdown.vue'
import { useModelsSocket } from '@/composables/use-models-socket'

interface ChatMessageActionsProps {
  role: 'user' | 'assistant'
  showRewrite?: boolean
}

withDefaults(defineProps<ChatMessageActionsProps>(), {
  showRewrite: true,
})

const emit = defineEmits<{
  (event: 'edit'): void
  (event: 'delete'): void
  (event: 'rewrite', modelId: string): void
}>()

const { groupedModels: rawGroupedModels, isLoadingModels, modelsError } = useModelsSocket()

const selectedModel = ref('')

const modelGroups = computed<DropdownGroup[]>(() =>
  rawGroupedModels.value.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      value: item.value,
      label: item.label,
      icon: item.icon,
      disabled: item.disabled ?? false,
    })),
  }))
)

function handleEdit(close: () => void) {
  close()
  emit('edit')
}

function handleDelete(close: () => void) {
  close()
  emit('delete')
}

function handleRewrite(modelId: string, close: () => void) {
  close()
  emit('rewrite', modelId)
  selectedModel.value = ''
}
</script>
