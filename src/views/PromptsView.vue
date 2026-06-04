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
        <!-- Prompt list (top) -->
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

        <!-- Editor panel (bottom) -->
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
            :tabs="tabs"
            :injection-mode="injectionMode"
            :injection-interval="injectionInterval"
            :injection-position="injectionPosition"
            :injection-include-history="injectionIncludeHistory"
            @save="handleSave"
            @change="handleChange"
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
        <!-- Left pane: prompt list -->
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

        <!-- Right pane: editor -->
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
            :tabs="tabs"
            :injection-mode="injectionMode"
            :injection-interval="injectionInterval"
            :injection-position="injectionPosition"
            :injection-include-history="injectionIncludeHistory"
            @save="handleSave"
            @change="handleChange"
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
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
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
import PromptEditor from '@/components/PromptEditor.vue'
import PromptInjectionSettings from '@/components/PromptInjectionSettings.vue'

// ---------------------------------------------------------------------------
// Inline sub-components (avoid new files for small render chunks)
// ---------------------------------------------------------------------------

/** Renders the prompt list or an empty-state CTA. */
const PromptList = defineAsyncComponent(() =>
  Promise.resolve({
    props: ['prompts', 'selectedPromptId', 'isPro'],
    emits: ['promptClick', 'newPrompt'],
    template: `
      <template>
        <div
          v-if="prompts.length === 0"
          class="flex flex-col items-center justify-center gap-3 py-16 text-center"
        >
          <span class="i-bi:chat-square-text text-subtleText text-3xl" />
          <p class="text-sm text-subtleText">No prompts yet.</p>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-borderMuted bg-panel text-sm text-deepText hover:border-accent/50 transition-colors"
            @click="$emit('newPrompt')"
          >
            <span class="i-bi:plus-lg text-sm" /> Create your first prompt
          </button>
        </div>
        <button
          v-for="prompt in prompts"
          :key="prompt.id"
          type="button"
          :aria-pressed="selectedPromptId === prompt.id"
          class="flex flex-col gap-0.5 px-3.5 py-3 rounded-lg border text-left transition-colors relative group"
          :class="[
            selectedPromptId === prompt.id
              ? 'border-accent bg-accentDim'
              : 'border-borderMuted bg-panel hover:border-accent/50',
            prompt.isPremium && !isPro ? 'opacity-80' : '',
          ]"
          :data-testid="'prompt-list-item-' + prompt.id"
          :title="prompt.isPremium && !isPro ? 'Upgrade to Pro to use this prompt' : undefined"
          @click="$emit('promptClick', prompt)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium text-deepText truncate">{{ prompt.name }}</span>
            <i v-if="prompt.isPremium && !isPro" class="i-bi:lock-fill text-accent text-xs" />
          </div>
          <span class="text-xs text-subtleText">/{{ prompt.command || '' }}</span>
        </button>
      </template>
    `,
  })
)

/** Renders the right-hand editor panel including upgrade nudge, tabs, editor and actions. */
const PromptEditorPanel = {
  components: { PromptEditor, PromptInjectionSettings },
  props: [
    'selectedPrompt', 'isCreating', 'isSaving', 'isDeleting', 'isPro',
    'isUpgrading', 'showUpgradeNudge', 'activeTab', 'tabs',
    'injectionMode', 'injectionInterval', 'injectionPosition', 'injectionIncludeHistory',
  ],
  emits: ['save', 'change', 'delete', 'tabChange', 'upgrade', 'saveInjectionSetting'],
  template: `
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
          <p class="text-sm text-subtleText">This is a Pro prompt. Upgrade to unlock all premium prompts.</p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
          :disabled="isUpgrading"
          @click="$emit('upgrade')"
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
            @click="$emit('tabChange', tab.id)"
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
            @save="$emit('save', $event)"
            @change="$emit('change')"
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
            :mode="injectionMode"
            :interval="injectionInterval"
            :position="injectionPosition"
            :include-history="injectionIncludeHistory"
            @update:mode="$emit('saveInjectionSetting', 'promptInjectionMode', $event)"
            @update:interval="$emit('saveInjectionSetting', 'promptInjectionInterval', $event)"
            @update:position="$emit('saveInjectionSetting', 'promptInjectionPosition', $event)"
            @update:include-history="$emit('saveInjectionSetting', 'promptIncludeHistory', $event)"
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
            @click="$emit('delete')"
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
  `,
}

// ---------------------------------------------------------------------------
// Composables
// ---------------------------------------------------------------------------

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

const selectedPrompt = computed(() =>
  prompts.value.find((prompt) => prompt.id === selectedPromptId.value)
)

function selectPrompt(prompt: { id: number }) {
  isCreating.value = false
  selectedPromptId.value = prompt.id
  activeTab.value = 'edit'
  showUpgradeNudge.value = false
}

function handlePromptClick(prompt: { id: number; isPremium?: boolean }) {
  if (prompt.isPremium && !isPro.value) {
    showUpgradeNudge.value = true
    selectedPromptId.value = undefined
    isCreating.value = false
    return
  }

  selectPrompt(prompt)
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

function handleChange() {}

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

const tabs = [
  { id: 'edit' as const, label: 'Edit' },
  { id: 'injection' as const, label: 'Injection Settings' },
]
const activeTab = ref<'edit' | 'injection'>('edit')

const getSetting = (key: string) =>
  settings.value.find((setting) => setting.settingKey === key)?.settingValue

const injectionMode = computed(
  () => (getSetting('promptInjectionMode') as PromptInjectionMode) ?? 'always'
)
const injectionInterval = computed(() => (getSetting('promptInjectionInterval') as number) ?? 5)
const injectionPosition = computed(
  () => (getSetting('promptInjectionPosition') as PromptInjectionPosition) ?? 'system'
)
const injectionIncludeHistory = computed(
  () => (getSetting('promptIncludeHistory') as boolean) ?? true
)

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
