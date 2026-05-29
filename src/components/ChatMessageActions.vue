<template>
  <BaseDropdownMenu
    trigger-data-testid="message-menu-button"
    menu-data-testid="message-menu-dropdown"
  >
    <template #default="{ close }">
      <!-- Copy -->
      <BaseButton
        v-if="isClipboardSupported"
        data-testid="message-copy-button"
        variant="ghost"
        :icon="hasCopied ? 'i-bi:check2' : 'i-weui:copy-outlined'"
        class="w-full text-subtleText"
        type="button"
        @click="handleCopy(close)"
      >
        <span>{{ hasCopied ? 'Copied' : 'Copy' }}</span>
      </BaseButton>

      <div
        v-if="isEditable || isRewritable || isDeletable"
        class="border-t border-borderMuted my-1"
      />

      <!-- Edit -->
      <BaseButton
        v-if="isEditable"
        data-testid="message-edit-button"
        variant="ghost"
        icon="i-weui:pencil-outlined"
        class="w-full text-subtleText"
        type="button"
        @click="handleEdit(close)"
      >
        Edit Message
      </BaseButton>

      <div
        v-if="isEditable && isRewritable"
        class="border-t border-borderMuted my-1"
      />

      <!-- Rewrite -->
      <BaseDropdown
        v-if="isRewritable"
        data-testid="message-rewrite-selector"
        variant="icon"
        icon=""
        :model-value="selectedModel"
        :groups="modelGroups"
        :is-disabled="isLoadingModels"
        placement="right"
        @update:model-value="(modelId) => handleRewrite(modelId, close)"
      >
        <div class="w-full flex justify-between items-center px-2 gap-2">
          <i class="i-bi:arrow-repeat"></i>
          <span v-if="isLoadingModels">Loading models...</span>
          <span v-else-if="modelsError">Error loading models</span>
          <span v-else>Rewrite with...</span>
          <i class="i-weui:arrow-outlined rotate-90 opacity-50" />
        </div>
      </BaseDropdown>

      <div
        v-if="(isEditable || isRewritable) && isDeletable"
        class="border-t border-borderMuted my-1"
      />


      <!-- TTS -->
      <BaseButton
        data-testid="message-tts-button"
        variant="ghost"
        :icon="ttsIcon"
        class="w-full text-subtleText"
        type="button"
        :title="ttsTooltip"
        @click="handleTts(close)"
      >
        <span>{{ isPlayingThis ? 'Stop' : 'Play aloud' }}</span>
      </BaseButton>

      <!-- Speed Control (only when playing) -->
      <div v-if="isPlayingThis" class="px-2 py-1 flex flex-col gap-1">
        <span class="text-[10px] text-subtleText uppercase font-bold px-1">Speed</span>
        <div class="flex gap-1">
          <button
            v-for="s in [0.75, 1, 1.25, 1.5]"
            :key="s"
            @click="setSpeed(s)"
            class="px-1.5 py-0.5 rounded text-[10px] transition-colors"
            :class="ttsSpeed === s ? 'bg-accent text-white' : 'bg-slate/50 text-subtleText hover:bg-slate'"
          >
            {{ s }}x
          </button>
        </div>
      </div>

      <div class="border-t border-borderMuted my-1" />

      <!-- Delete -->
      <BaseButton
        v-if="isDeletable"
        data-testid="message-delete-button"
        variant="ghost"
        icon="i-weui:delete-outlined"
        class="w-full text-error"
        type="button"
        @click="handleDelete(close)"
      >
        Delete Message
      </BaseButton>
    </template>
  </BaseDropdownMenu>
</template>

<script setup lang="ts">

import { computed, ref } from 'vue'
import { useTts } from '@/composables/use-tts'
import { useClipboard } from '@vueuse/core'
import { useToastStore } from '@/stores/use-toast-store'
import BaseDropdownMenu from '@/components/BaseDropdownMenu.vue'
import BaseDropdown, { type DropdownGroup } from '@/components/BaseDropdown.vue'
import BaseButton from '@/components/BaseButton.vue'
import { useModelsSocket } from '@/composables/use-models-socket'


interface ChatMessageActionsProps {
  messageId: number
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
const toasts = useToastStore()

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

const isEditable = computed(() => props.isEditEnabled && props.role === 'user')
const isRewritable = computed(() => props.isRewriteEnabled && props.role === 'assistant')

const isDeletable = computed(() => props.isDeleteEnabled)

const { currentlyPlayingId, status, speak, stop, ttsSpeed, setSpeed } = useTts()
const isPlayingThis = computed(() => currentlyPlayingId.value === props.messageId)
const ttsIcon = computed(() => {
  if (!isPlayingThis.value) return 'i-bi:volume-up'
  if (status.value === 'loading') return 'i-svg-spinners:180-ring'
  return 'i-bi:stop-fill'
})

const ttsTooltip = computed(() => {
  if (!isPlayingThis.value) return 'Play aloud'
  if (status.value === 'loading') return 'Loading voice model...'
  return 'Stop'
})

async function handleTts(close: () => void) {
  if (isPlayingThis.value && status.value !== 'loading') {
    stop()
  } else {
    await speak(props.messageId, props.messageContent)
  }
  close()
}

async function handleCopy(close: () => void): Promise<void> {
  if (!isClipboardSupported.value) return

  const textToCopy = props.messageContent.trim()
  if (!textToCopy) return

  await copy(textToCopy)
  toasts.success('Message copied')

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
