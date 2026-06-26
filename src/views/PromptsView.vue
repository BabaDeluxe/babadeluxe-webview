<template>
  <section
    id="prompts"
    data-testid="prompts-view"
    class="relative flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-slate"
  >
    <!-- Header -->
    <div class="flex items-center justify-between gap-4 px-4 pt-4 pb-2">
      <h2 class="text-xl font-onest font-semibold text-deepText">Prompts</h2>
      <BaseButton
        variant="primary"
        icon="i-bi:plus-lg"
        text="New Prompt"
        data-testid="create-prompt-button"
        @click="handleNewPrompt"
      />
    </div>

    <!-- Loading -->
    <div
      v-if="isLoading"
      class="flex-1 flex items-center justify-center"
    >
      <BaseSpinner
        size="medium"
        message="Loading prompts..."
      />
    </div>

    <template v-else>
      <!-- Mobile: vertical split -->
      <div
        ref="vertical-split-container"
        class="flex flex-col flex-1 min-h-0 md:hidden px-4 pb-4"
      >
        <div
          class="flex flex-col gap-2 overflow-y-auto pr-1"
          :style="{ height: verticalTopHeightPercent }"
        >
          <PromptList
            :prompts="prompts"
            :selected-prompt-id="selectedPromptId"
            :is-pro="isPro"
            @prompt-click="handlePromptClick"
            @new-prompt="handleNewPrompt"
          />
        </div>

        <!-- Vertical drag handle -->
        <div
          class="relative flex items-center justify-center flex-shrink-0 cursor-row-resize group touch-none select-none py-3"
          :class="{ 'bg-accent/10': verticalIsDragging }"
          @pointerdown="verticalStartDragging"
        >
          <div
            class="h-0.5 w-12 rounded-full transition-all"
            :class="
              verticalIsDragging
                ? 'bg-accent w-16'
                : 'bg-borderMuted group-hover:bg-accent group-hover:w-16'
            "
          />
        </div>

        <div
          class="flex flex-col gap-3 overflow-y-auto pt-2 pr-1 border-t border-borderMuted"
          :style="{ height: verticalBottomHeightPercent }"
        >
          <PromptEditorPanel
            :selected-prompt="selectedPrompt"
            :is-creating="isCreating"
            :is-saving="isSaving"
            :is-deleting="isDeleting"
            :is-pro="isPro"
            :is-upgrading="isUpgrading"
            :show-upgrade-nudge="showUpgradeNudge"
            :active-tab="activeTab"
            :injection-settings="injectionSettings"
            @save="handleSave"
            @delete="handleDelete"
            @tab-change="activeTab = $event"
            @upgrade="redirectToCheckout"
            @save-injection-setting="saveInjectionSetting"
          />
        </div>
      </div>

      <!-- Desktop: horizontal split -->
      <div
        ref="horizontal-split-container"
        class="hidden md:flex flex-row flex-1 min-h-0 relative px-4 pb-4"
      >
        <div
          class="flex flex-col gap-2 overflow-y-auto pr-2 min-w-0"
          :style="{ width: splitLeftWidthPercent }"
        >
          <PromptList
            :prompts="prompts"
            :selected-prompt-id="selectedPromptId"
            :is-pro="isPro"
            @prompt-click="handlePromptClick"
            @new-prompt="handleNewPrompt"
          />
        </div>

        <!-- Horizontal drag handle -->
        <div
          class="relative flex items-center justify-center cursor-col-resize group touch-none select-none px-3"
          :class="{ 'bg-accent/10': splitIsDragging }"
          @pointerdown="splitStartDragging"
        >
          <div
            class="w-0.5 h-12 rounded-full transition-all"
            :class="
              splitIsDragging
                ? 'bg-accent h-16'
                : 'bg-borderMuted group-hover:bg-accent group-hover:h-16'
            "
          />
        </div>

        <div
          class="flex flex-col gap-3 overflow-y-auto pl-2 pr-1 border-l border-borderMuted min-w-0"
          :style="{ width: splitRightWidthPercent }"
        >
          <PromptEditorPanel
            :selected-prompt="selectedPrompt"
            :is-creating="isCreating"
            :is-saving="isSaving"
            :is-deleting="isDeleting"
            :is-pro="isPro"
            :is-upgrading="isUpgrading"
            :show-upgrade-nudge="showUpgradeNudge"
            :active-tab="activeTab"
            :injection-settings="injectionSettings"
            @save="handleSave"
            @delete="handleDelete"
            @tab-change="activeTab = $event"
            @upgrade="redirectToCheckout"
            @save-injection-setting="saveInjectionSetting"
          />
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { validateSetting } from '../services/prompt-injection-service'
import type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '../services/prompt-injection-service'
import { usePromptsSocket as usePrompts } from '@/composables/use-prompts-socket'
import { useSettings } from '@/composables/use-settings'
import { useToastStore } from '@/stores/use-toast-store'
import { toUserMessage } from '@/error-mapper'
import { useSubscriptionSocket } from '@/composables/use-subscription-socket'
import { useResizableSplit } from '@/composables/use-resizable-split'
import { KEY_VALUE_STORE_KEY } from '@/injection-keys'
import { safeInject } from '@/safe-inject'
import BaseButton from '@/components/BaseButton.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import PromptList from '@/components/PromptList.vue'
import PromptEditorPanel from '@/components/PromptEditorPanel.vue'
import type { InjectionSettings } from '@/components/PromptEditorPanel.vue'

const keyValueStore = safeInject(KEY_VALUE_STORE_KEY)

const {
  leftWidthPercent: splitLeftWidthPercent,
  rightWidthPercent: splitRightWidthPercent,
  isDragging: splitIsDragging,
  startDragging: splitStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'prompts-horizontal-split-ratio',
  refKey: 'horizontal-split-container',
  defaultRatio: 35,
  minRatio: 20,
  maxRatio: 75,
  direction: 'horizontal',
})

const {
  leftWidthPercent: verticalTopHeightPercent,
  rightWidthPercent: verticalBottomHeightPercent,
  isDragging: verticalIsDragging,
  startDragging: verticalStartDragging,
} = useResizableSplit({
  keyValueStore,
  storageKey: 'prompts-vertical-split-ratio',
  refKey: 'vertical-split-container',
  defaultRatio: 40,
  minRatio: 20,
  maxRatio: 80,
  direction: 'vertical',
})

const { prompts, isLoading, createPrompt, updatePrompt, deletePrompt, fetchPrompts } = usePrompts()
const { settings, upsertSetting, loadSettings } = useSettings()
const { tier, redirectToCheckout, isUpgrading } = useSubscriptionSocket()
const toasts = useToastStore()

const isPro = computed(() => tier.value === 'PRO')
const showUpgradeNudge = ref(false)
const selectedPromptId = ref<number | undefined>()
const isCreating = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)
const activeTab = ref<'edit' | 'injection'>('edit')

const selectedPrompt = computed(() =>
  prompts.value.find((prompt) => prompt.id === selectedPromptId.value)
)

const getSetting = (key: string) =>
  settings.value.find((setting) => setting.settingKey === key)?.settingValue

const injectionSettings = computed<InjectionSettings>(() => ({
  mode: (getSetting('promptInjectionMode') as PromptInjectionMode) ?? 'always',
  interval: (getSetting('promptInjectionInterval') as number) ?? 5,
  position: (getSetting('promptInjectionPosition') as PromptInjectionPosition) ?? 'system',
  includeHistory: (getSetting('promptIncludeHistory') as boolean) ?? true,
}))

function handlePromptClick(prompt: { id: number; isPremium?: boolean }) {
  if (prompt.isPremium && !isPro.value) {
    showUpgradeNudge.value = true
    selectedPromptId.value = undefined
    isCreating.value = false
    return
  }
  isCreating.value = false
  selectedPromptId.value = prompt.id
  activeTab.value = 'edit'
  showUpgradeNudge.value = false
}

function handleNewPrompt() {
  showUpgradeNudge.value = false
  isCreating.value = true
  selectedPromptId.value = undefined
  activeTab.value = 'edit'
}

async function handleSave(payload: {
  id?: number
  name: string
  command: string
  description?: string
  template: string
}) {
  isSaving.value = true
  const result = payload.id
    ? await updatePrompt(payload as Required<typeof payload>)
    : await createPrompt(payload)
  isSaving.value = false

  result.match(
    () => {
      toasts.success(payload.id ? 'Prompt updated' : 'Prompt created')
      isCreating.value = false
      void fetchPrompts()
    },
    (err) => {
      toasts.error(toUserMessage(err))
    }
  )
}

async function handleDelete() {
  if (!selectedPromptId.value) return
  isDeleting.value = true

  const result = await deletePrompt(selectedPromptId.value)
  isDeleting.value = false

  result.match(
    () => {
      toasts.success('Prompt deleted')
      selectedPromptId.value = undefined
    },
    (err) => {
      toasts.error(toUserMessage(err))
    }
  )
}

async function saveInjectionSetting(key: string, value: unknown) {
  const dataType =
    typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string'

  const validation = validateSetting(key, value)
  if (!validation.success) {
    toasts.error(validation.error || 'Invalid setting')
    return
  }

  const result = await upsertSetting(key, value, dataType)
  result.match(
    () => {},
    (err) => {
      toasts.error(toUserMessage(err))
    }
  )
}

onMounted(async () => {
  await Promise.all([fetchPrompts(), loadSettings()])
})
</script>
