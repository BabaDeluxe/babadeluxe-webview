<template>
  <BaseDropdownMenu
    trigger-test-id="message-menu-button"
    menu-test-id="message-menu-dropdown"
  >
    <template #default="{ close }">
      <!-- Copy -->
      <BaseButton
        v-if="isClipboardSupported"
        variant="ghost"
        data-testid="message-copy-button"
        class="w-full text-sm"
        type="button"
        @click="handleCopy(close)"
      >
        <i :class="hasCopied ? 'i-bi:check2' : 'i-weui:copy-outlined'" />
        <span>{{ hasCopied ? 'Copied' : 'Copy' }}</span>
      </BaseButton>

      <div
        v-if="canEdit || canRewrite || canDelete"
        class="border-t border-borderMuted my-1"
      />

      <!-- Edit -->
      <BaseButton
        v-if="canEdit"
        variant="ghost"
        data-testid="message-edit-button"
        class="w-full text-sm"
        type="button"
        @click="handleEdit(close)"
      >
        <i class="i-weui:pencil-outlined" />
        <span>Edit Message</span>
      </BaseButton>

      <div
        v-if="canEdit && canRewrite"
        class="border-t border-borderMuted my-1"
      />

      <!-- Rewrite -->
      <BaseDropdown
        v-if="canRewrite"
        variant="ghost"
        class="w-full text-sm"
        data-testid="message-rewrite-selector"
        :model-value="selectedModel"
        icon="i-bi:arrow-repeat"
        trigger-class="w-full px-3 py-2 flex items-center justify-between gap-2 text-subtleText hover:text-deepText hover:bg-borderMuted/20 transition-colors duration-150 hover:cursor-pointer rounded-lg"
        :groups="modelGroups"
        :is-disabled="isLoadingModels"
        placement="right"
        is-full-width
        @update:model-value="(modelId) => handleRewrite(modelId, close)"
      >
        <i class="i-bi:arrow-repeat" />
        <span v-if="isLoadingModels">Loading models...</span>
        <span v-else-if="modelsError">Error loading models</span>
        <span v-else>Rewrite with...</span>
        <i class="i-weui:arrow-outlined rotate-90 opacity-50" />
      </BaseDropdown>

      <div
        v-if="(canEdit || canRewrite) && canDelete"
        class="border-t border-borderMuted my-1"
      />

      <!-- Delete -->
      <BaseButton
        v-if="canDelete"
        variant="ghost"
        class="hover:text-error w-full text-sm"
        data-testid="message-delete-button"
        type="button"
        @click="handleDelete(close)"
      >
        <i class="i-weui:delete-outlined" />
        <span>Delete Message</span>
      </BaseButton>
    </template>
  </BaseDropdownMenu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import BaseDropdownMenu from '@/components/BaseDropdownMenu.vue'
import BaseDropdown, { type DropdownGroup } from '@/components/BaseDropdown.vue'
import BaseButton from '@/components/BaseButton.vue'
import { useModelsSocket } from '@/composables/use-models-socket'

interface ChatMessageActionsProps {
  role: 'user' | 'assistant'
  messageContent: string
  isEditEnabled?: boolean
  isRewriteEnabled?: boolean
  isDeleteEnabled?: boolean
}

const props = withDefaults(defineProps<ChatMessageActionsProps>(), {
  isEditEnabled: true,
  isRewriteEnabled: true,
  isDeleteEnabled: true,
})

const emit = defineEmits<{
  (event: 'edit'): void
  (event: 'delete'): void
  (event: 'rewrite', modelId: string): void
}>()

const { groupedModels: rawGroupedModels, isLoadingModels, modelsError } = useModelsSocket()

const selectedModel = ref('')

const {
  copy,
  copied: hasCopied,
  isSupported,
} = useClipboard({
  copiedDuring: 1200,
  legacy: true,
})

const isClipboardSupported = computed(() => isSupported.value)

const modelGroups = computed<DropdownGroup[]>(() =>
  rawGroupedModels.value.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      value: item.value,
      label: item.label,
      icon: item.icon,
      isDisabled: item.isDisabled ?? false,
    })),
  }))
)

const canEdit = computed(() => props.isEditEnabled && props.role === 'user')
const canRewrite = computed(() => props.isRewriteEnabled && props.role === 'assistant')
const canDelete = computed(() => props.isDeleteEnabled)

async function handleCopy(close: () => void): Promise<void> {
  if (!isClipboardSupported.value) return

  const textToCopy = props.messageContent.trim()
  if (!textToCopy) return

  await copy(textToCopy)

  // always close after copy resolves to avoid timing flakiness
  close()
}

async function handleEdit(close: () => void): Promise<void> {
  emit('edit')
  // let the click/active animation settle before unmounting the menu
  await Promise.resolve()
  close()
}

async function handleDelete(close: () => void): Promise<void> {
  emit('delete')
  await Promise.resolve()
  close()
}

function handleRewrite(modelId: string, close: () => void): void {
  emit('rewrite', modelId)
  selectedModel.value = ''
  // defer close so dropdown’s own state settles
  requestAnimationFrame(() => {
    close()
  })
}
</script>
