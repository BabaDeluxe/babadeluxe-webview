<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between border-b border-borderMuted/20 pb-4">
      <h4 class="text-lg font-onest font-semibold text-deepText">
        {{ isCreating ? 'Create New Prompt' : 'Edit Prompt' }}
      </h4>

      <div class="flex gap-2" v-if="canDuplicate">
         <BaseButton
          variant="ghost"
          icon="i-bi:copy"
          class="text-xs"
          @click="emit('duplicate', localPrompt)"
        >
          {{ duplicateLabel }}
        </BaseButton>
      </div>
    </div>

    <!-- Prompt Name -->
    <BaseInput
      :model-value="localPrompt.name"
      label="Prompt Name"
      placeholder="e.g. Code Reviewer"
      data-testid="prompt-name-input"
      :is-disabled="isSaving"
      :is-required="true"
      :error="showValidationErrors ? validationErrors.name : undefined"
      @update:model-value="handleNameChange"
    />

    <!-- Command (with prefix) -->
    <div class="flex flex-col gap-1.5">
      <label
        :for="commandId"
        class="text-sm font-medium text-subtleText"
      >
        Command
      </label>
      <div
        class="flex items-center gap-0 rounded-lg overflow-hidden transition-all bg-panel border"
        :class="[
          isSaving
            ? 'border-borderMuted opacity-50 pointer-events-none'
            : showValidationErrors && validationErrors.command
              ? 'border-error shadow-sm shadow-error/10'
              : 'border-borderMuted focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20',
        ]"
      >
        <span class="text-subtleText/60 px-3 bg-slate/30 font-mono">/</span>
        <input
          :id="commandId"
          v-model="localPrompt.command"
          type="text"
          placeholder="e.g. review"
          data-testid="prompt-command-input"
          class="flex-1 px-3 py-2.5 bg-transparent text-deepText placeholder-subtleText/40 outline-none border-none font-mono text-sm"
          :disabled="isSaving"
          @input="handleCommandChange"
        />
      </div>
      <span
        v-if="showValidationErrors && validationErrors.command"
        role="alert"
        class="text-error text-xs mt-1"
      >
        {{ validationErrors.command }}
      </span>
    </div>

    <!-- Description -->
    <BaseInput
      :model-value="localPrompt.description ?? ''"
      label="Description"
      placeholder="e.g. Acts as a senior dev providing a code review."
      data-testid="prompt-description-input"
      :is-disabled="isSaving"
      :is-required="false"
      @update:model-value="handleDescriptionChange"
    />

    <!-- Template -->
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between items-center">
        <label
          :for="templateId"
          class="text-sm font-medium text-subtleText"
        >
          Template
        </label>
        <span
          class="text-xs font-mono transition-colors"
          :class="characterCountClass"
        >
          {{ templateCharCount }}/{{ templateLimits.maxPromptLength }}
        </span>
      </div>
      <textarea
        :id="templateId"
        v-model="localPrompt.template"
        placeholder="Act as a senior software engineer doing a code review. Focus on clarity and performance."
        data-testid="prompt-template-input"
        :class="[
          'w-full px-4 py-3 rounded-xl bg-panel text-deepText placeholder-subtleText/40 focus:outline-none resize-none transition-all border font-onest text-sm leading-relaxed',
          isSaving
            ? 'border-borderMuted opacity-50 cursor-not-allowed'
            : showValidationErrors && validationErrors.template
              ? 'border-error shadow-sm shadow-error/10'
              : 'border-borderMuted focus:border-accent focus:ring-1 focus:ring-accent/20',
        ]"
        :rows="rows"
        :maxlength="templateLimits.maxPromptLength"
        :disabled="isSaving"
        @input="handleTemplateChange"
      />
      <span
        v-if="showValidationErrors && validationErrors.template"
        role="alert"
        class="text-error text-xs mt-1"
      >
        {{ validationErrors.template }}
      </span>
    </div>

    <!-- Save Button -->
    <div class="flex justify-end pt-4 mt-2 border-t border-borderMuted/10">
      <BaseButton
        variant="primary"
        :is-disabled="!canSave"
        :is-loading="isSaving"
        data-testid="prompt-save-button"
        class="px-8"
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
import { templateLimits } from '@/constants'

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
  canDuplicate?: boolean
  duplicateLabel?: string
}

const props = withDefaults(defineProps<PromptEditorProps>(), {
  prompt: undefined,
  rows: 10,
  canDuplicate: false,
  duplicateLabel: 'Duplicate',
})

const emit = defineEmits<{
  save: [
    payload: { id?: number; name: string; command: string; description?: string; template: string },
  ]
  change: []
  duplicate: [payload: Prompt]
}>()

const commandId = useId()
const templateId = useId()

const localPrompt = ref<Prompt>({
  id: undefined,
  name: '',
  command: '',
  description: '',
  template: '',
})

const showValidationErrors = ref(false)

watch(
  () => props.prompt,
  (newPrompt) => {
    showValidationErrors.value = false

    if (newPrompt) {
      localPrompt.value = {
        id: newPrompt.id,
        name: newPrompt.name ?? '',
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

  if (count >= templateLimits.maxPromptLength) return 'text-error font-semibold'
  if (count >= templateLimits.warningThreshold) return 'text-warning'
  return 'text-subtleText/60'
})

const validationErrors = computed(() => {
  const errors: Record<string, string> = {}

  if (localPrompt.value.name.trim().length === 0) {
    errors.name = 'Prompt name is required'
  }

  if (localPrompt.value.command.trim().length === 0) {
    errors.command = 'Command is required'
  }

  if (localPrompt.value.template.trim().length === 0) {
    errors.template = 'Template is required'
  } else if (localPrompt.value.template.length > templateLimits.maxPromptLength) {
    errors.template = `Template exceeds maximum length of ${templateLimits.maxPromptLength} characters`
  }

  return errors
})

const isFormValid = computed(() => {
  return Object.keys(validationErrors.value).length === 0
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

function clearValidationOnChange() {
  if (showValidationErrors.value) {
    showValidationErrors.value = false
  }
  emit('change')
}

function handleNameChange(value: string | number) {
  localPrompt.value.name = String(value)
  clearValidationOnChange()
}

function handleCommandChange() {
  clearValidationOnChange()
}

function handleDescriptionChange(value: string | number) {
  localPrompt.value.description = String(value)
  emit('change')
}

function handleTemplateChange() {
  clearValidationOnChange()
}

function handleSave() {
  if (!isFormValid.value) {
    showValidationErrors.value = true
    return
  }

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
