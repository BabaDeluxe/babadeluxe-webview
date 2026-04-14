<template>
  <div class="flex flex-col gap-2">
    <ContextRootBar
      v-if="isInVsCode && isContextRootBarVisible"
      @hide="emit('hide-root-bar')"
    />

    <ContextPanel
      v-if="isInVsCode"
      :items="contextItems"
      :has-error="hasContextError"
      :is-loading="isLoadingContext"
      :is-root-bar-visible="isContextRootBarVisible"
      @toggle-root-bar="emit('toggle-root-bar')"
      @remove-item="emit('remove-context-item', $event)"
      @clear-all="emit('clear-all-context')"
      @toggle-lock="emit('toggle-lock', $event)"
    />

    <ChatInput
      ref="chatInputRef"
      :model-value="modelValue"
      :is-disabled="isDisabled"
      :is-loading="isLoading"
      :is-submitting="isSubmitting"
      :placeholder="placeholder"
      :test-id="testId"
      :submit-button-test-id="submitButtonTestId"
      :abort-button-test-id="abortButtonTestId"
      @update:model-value="emit('update:modelValue', $event)"
      @submit="emit('submit')"
      @abort="emit('abort')"
    >
      <template #controls>
        <ChatInputControls
          :prompt="currentPrompt"
          :model="currentModel"
          :prompt-options="promptOptions"
          :model-groups="groupedModels"
          :is-loading-models="isLoadingModels"
          @update:prompt="emit('update:prompt', $event)"
          @update:model="emit('update:model', $event)"
        />
      </template>

      <template #footer>
        <div
          v-if="contextUsageWarning"
          class="mt-1 text-xs text-subtleText"
        >
          {{ contextUsageWarning }}
          <div class="mt-1 h-1 w-full bg-borderMuted rounded overflow-hidden">
            <div
              class="h-full bg-accent transition-all"
              :style="{ width: `${Math.round(lastContextUsage * 100)}%` }"
            />
          </div>
        </div>
      </template>
    </ChatInput>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ChatInput from '@/components/ChatInput.vue'
import ContextPanel from '@/components/ContextPanel.vue'
import ContextRootBar from '@/components/ContextRootBar.vue'
import ChatInputControls from '@/components/ChatInputControls.vue'
import type { DropdownItem, DropdownGroup } from '@/components/BaseDropdown.vue'

defineProps<{
  modelValue: string
  isInVsCode: boolean
  isContextRootBarVisible: boolean
  contextItems: any[]
  hasContextError: boolean
  isLoadingContext: boolean
  isDisabled: boolean
  isLoading: boolean
  isSubmitting: boolean
  placeholder: string
  testId: string
  submitButtonTestId: string
  abortButtonTestId: string
  currentPrompt: string
  currentModel: string
  promptOptions: DropdownItem[]
  groupedModels: DropdownGroup[]
  isLoadingModels: boolean
  contextUsageWarning: string
  lastContextUsage: number
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:prompt', value: string): void
  (event: 'update:model', value: string): void
  (event: 'submit'): void
  (event: 'abort'): void
  (event: 'hide-root-bar'): void
  (event: 'toggle-root-bar'): void
  (event: 'remove-context-item', payload: any): void
  (event: 'clear-all-context'): void
  (event: 'toggle-lock', filePath: string): void
}>()

const chatInputRef = ref<InstanceType<typeof ChatInput>>()
defineExpose({ focus: () => chatInputRef.value?.focus() })
</script>
