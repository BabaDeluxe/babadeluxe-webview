<template>
  <div class="flex flex-col gap-3 h-full">
    <!-- Upgrade nudge -->
    <div
      v-if="showUpgradeNudge"
      class="bg-accentDim border border-accent border-dashed rounded-lg p-6 flex flex-col items-center text-center gap-4 animate-fade-in"
    >
      <div class="p-3 bg-accent/10 rounded-full">
        <i class="i-bi:gem text-accent text-3xl" />
      </div>
      <div class="flex flex-col gap-1">
        <h3 class="text-lg font-semibold text-deepText">Premium Prompt</h3>
        <p class="text-sm text-subtleText">
          This is a Pro prompt. Upgrade to unlock all premium prompts.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        :disabled="isUpgrading"
        @click="emit('upgrade')"
      >
        Upgrade Now
      </button>
    </div>

    <template v-else-if="selectedPrompt || isCreating">
      <!-- Tab bar -->
      <div
        v-if="!isCreating"
        role="tablist"
        class="flex gap-1 p-0.5 rounded-lg bg-panel border border-borderMuted self-start"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          role="tab"
          type="button"
          class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="
            activeTab === tab.id
              ? 'bg-accentDim text-accent border border-accentBorder'
              : 'text-subtleText hover:text-deepText'
          "
          :data-testid="'tab-' + tab.id"
          @click="emit('tabChange', tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Edit tab -->
      <div
        v-show="isCreating || activeTab === 'edit'"
        role="tabpanel"
        aria-labelledby="tab-edit"
      >
        <PromptEditor
          :prompt="selectedPrompt"
          :is-creating="isCreating"
          :is-saving="isSaving"
          @save="emit('save', $event)"
        />
      </div>

      <!-- Injection Settings tab -->
      <div
        v-if="!isCreating"
        v-show="activeTab === 'injection'"
        role="tabpanel"
        aria-labelledby="tab-injection"
      >
        <PromptInjectionSettings
          :mode="injectionSettings.mode"
          :interval="injectionSettings.interval"
          :position="injectionSettings.position"
          :include-history="injectionSettings.includeHistory"
          @update:mode="emit('saveInjectionSetting', 'promptInjectionMode', $event)"
          @update:interval="emit('saveInjectionSetting', 'promptInjectionInterval', $event)"
          @update:position="emit('saveInjectionSetting', 'promptInjectionPosition', $event)"
          @update:include-history="emit('saveInjectionSetting', 'promptIncludeHistory', $event)"
        />
      </div>

      <!-- Prompt actions -->
      <div
        v-if="selectedPrompt && !isCreating"
        class="flex justify-end gap-2 pt-2"
      >
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-borderMuted text-sm text-error hover:bg-error/10 transition-colors"
          :disabled="isDeleting"
          data-testid="delete-prompt-button"
          @click="emit('delete')"
        >
          <span class="i-bi:trash text-sm" /> Delete
        </button>
      </div>
    </template>

    <!-- Empty right-pane placeholder -->
    <div
      v-else
      class="flex flex-col items-center justify-center gap-2 py-16 text-center text-subtleText"
    >
      <span class="i-bi:arrow-left text-2xl" />
      <p class="text-sm">Select a prompt to edit</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '@/services/prompt-injection-service'
import PromptEditor from '@/components/PromptEditor.vue'
import PromptInjectionSettings from '@/components/PromptInjectionSettings.vue'

export interface InjectionSettings {
  mode: PromptInjectionMode
  interval: number
  position: PromptInjectionPosition
  includeHistory: boolean
}

interface Prompt {
  id: number
  name: string
  command?: string
  description?: string
  template: string
  isPremium?: boolean
}

const tabs = [
  { id: 'edit' as const, label: 'Edit' },
  { id: 'injection' as const, label: 'Injection Settings' },
]

defineProps<{
  selectedPrompt: Prompt | undefined
  isCreating: boolean
  isSaving: boolean
  isDeleting: boolean
  isPro: boolean
  isUpgrading: boolean
  showUpgradeNudge: boolean
  activeTab: 'edit' | 'injection'
  injectionSettings: InjectionSettings
}>()

const emit = defineEmits<{
  save: [
    payload: { id?: number; name: string; command: string; description?: string; template: string },
  ]
  delete: []
  tabChange: [tab: 'edit' | 'injection']
  upgrade: []
  saveInjectionSetting: [key: string, value: unknown]
}>()
</script>
