<template>
  <div class="flex flex-col gap-4">
    <h4 class="text-md font-medium text-deepText">
      {{ isCreating ? 'Create New Prompt' : 'Edit Prompt' }}
    </h4>

    <!-- Prompt Name -->
    <BaseInput
      :model-value="localPrompt.name"
      label="Prompt Name"
      placeholder="e.g. Code Reviewer"
      data-testid="prompt-name-input"
      :disabled="isSaving"
      :required="true"
      @update:model-value="
        (value) => {
          localPrompt.name = String(value)
          emit('change')
        }
      "
    />

    <!-- Command (with prefix) -->
    <div class="flex flex-col gap-1.5">
      <label
        :for="commandId"
        class="text-sm text-subtleText"
      >
        Command <span class="text-error">*</span>
      </label>
      <div
        class="flex items-center gap-0 rounded-md overflow-hidden transition-colors"
        :class="
          isSaving
            ? 'border border-borderMuted opacity-50 pointer-events-none'
            : 'border border-borderMuted focus-within:border-accent'
        "
      >
        <span class="text-subtleText px-3 bg-transparent"> /</span>
        <input
          :id="commandId"
          v-model="localPrompt.command"
          type="text"
          placeholder="e.g. review"
          data-testid="prompt-command-input"
          class="flex-1 px-3 py-2 bg-panel text-deepText placeholder-subtleText outline-none border-none"
          :disabled="isSaving"
          aria-required="true"
          @input="emit('change')"
        />
      </div>
    </div>

    <!-- Description -->
    <BaseInput
      :model-value="localPrompt.description ?? ''"
      label="Description (Optional)"
      placeholder="e.g. Acts as a senior dev providing a code review."
      data-testid="prompt-description-input"
      :disabled="isSaving"
      @update:model-value="
        (value) => {
          localPrompt.description = String(value)
          emit('change')
        }
      "
    />

    <!-- Template -->
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between items-center">
        <label
          :for="templateId"
          class="text-sm text-subtleText"
        >
          Template <span class="text-error">*</span>
        </label>
        <span
          class="text-xs transition-colors"
          :class="characterCountClass"
        >
          {{ templateCharCount }}/{{ maxTemplateLength }}
        </span>
      </div>
      <textarea
        :id="templateId"
        v-model="localPrompt.template"
        placeholder="<role>Act as a senior software engineer doing a code review.</role> Focus on code clarity, performance, and adherence to best practices."
        data-testid="prompt-template-input"
        :class="[
          'w-full px-3 py-2 border border-borderMuted rounded-md bg-panel text-deepText placeholder-subtleText focus:border-accent outline-none resize-none transition-colors',
          { 'opacity-50 cursor-not-allowed': isSaving },
        ]"
        :rows="rows"
        :maxlength="maxTemplateLength"
        :disabled="isSaving"
        aria-required="true"
        @input="emit('change')"
      />
    </div>

    <!-- Save Button -->
    <div class="flex justify-end gap-2">
      <BaseButton
        :disabled="!canSave"
        :loading="isSaving"
        data-testid="prompt-save-button"
        @click="handleSave"
      >
        {{ isSaving ? 'Saving...' : 'Save Changes' }}
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, useId } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseInput from '@/components/BaseInput.vue'

interface Prompt {
  id?: number
  name: string
  command: string
  description?: string
  template: string
}

interface PromptEditorProps {
  prompt?: Prompt
  isCreating: boolean
  isSaving: boolean
  rows?: number
}

const props = withDefaults(defineProps<PromptEditorProps>(), {
  prompt: undefined,
  rows: 10,
})

const emit = defineEmits<{
  save: [
    payload: { id?: number; name: string; command: string; description?: string; template: string },
  ]
  change: []
}>()

const maxTemplateLength = 20000

const commandId = useId()
const templateId = useId()

const localPrompt = ref<Prompt>({
  id: undefined,
  name: '',
  command: '',
  description: '',
  template: '',
})

watch(
  () => props.prompt,
  (newPrompt) => {
    if (newPrompt) {
      localPrompt.value = {
        id: newPrompt.id,
        name: newPrompt.name,
        command: newPrompt.command ?? '',
        description: newPrompt.description ?? '',
        template: newPrompt.template,
      }
    } else if (props.isCreating) {
      localPrompt.value = {
        id: undefined,
        name: '',
        command: '',
        description: '',
        template: '',
      }
    }
  },
  { immediate: true }
)

const templateCharCount = computed(() => localPrompt.value.template.length)

const characterCountClass = computed(() => {
  const count = templateCharCount.value
  const warningThreshold = 19000

  if (count >= maxTemplateLength) return 'text-error font-semibold'
  if (count >= warningThreshold) return 'text-warning'
  return 'text-subtleText'
})

const isFormValid = computed(() => {
  return (
    localPrompt.value.name.trim().length > 0 &&
    localPrompt.value.command.trim().length > 0 &&
    localPrompt.value.template.trim().length > 0
  )
})

const isDirty = computed(() => {
  if (props.isCreating) return true

  if (!props.prompt) return false

  return (
    localPrompt.value.name !== props.prompt.name ||
    localPrompt.value.command !== (props.prompt.command ?? '') ||
    (localPrompt.value.description ?? '') !== (props.prompt.description ?? '') ||
    localPrompt.value.template !== props.prompt.template
  )
})

const canSave = computed(() => {
  return isFormValid.value && isDirty.value && !props.isSaving
})

function handleSave() {
  if (!canSave.value) return

  const { id, name, command, description, template } = localPrompt.value

  emit('save', {
    id,
    name: name.trim(),
    command: command.trim(),
    description: description?.trim() || undefined,
    template: template.trim(),
  })
}
</script>
