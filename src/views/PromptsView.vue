<template>
  <section
    id="prompts"
    data-testid="prompts-view"
    class="flex-1 flex flex-col gap-6 p-4 sm:p-6 max-w-4xl mx-auto w-full"
  >
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
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
      <BaseSpinner size="medium" message="Loading prompts..." />
    </div>

    <template v-else>
      <!-- Two-column layout: list + editor/injection settings -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- ── Prompt List ── -->
        <div class="flex flex-col gap-2">
          <div
            v-if="prompts.length === 0"
            class="flex flex-col items-center justify-center gap-3 py-16 text-center"
          >
            <span class="i-bi:chat-square-text text-subtleText text-3xl" />
            <p class="text-sm text-subtleText">No prompts yet.</p>
            <BaseButton
              variant="secondary"
              icon="i-bi:plus-lg"
              text="Create your first prompt"
              @click="handleNewPrompt"
            />
          </div>

          <button
            v-for="prompt in prompts"
            :key="prompt.id"
            type="button"
            class="flex flex-col gap-0.5 px-3.5 py-3 rounded-lg border text-left transition-colors"
            :class="
              selectedPromptId === prompt.id
                ? 'border-accent bg-accentDim'
                : 'border-borderMuted bg-panel hover:border-accent/50'
            "
            :data-testid="`prompt-list-item-${prompt.id}`"
            @click="selectPrompt(prompt)"
          >
            <span class="text-sm font-medium text-deepText truncate">{{ prompt.name }}</span>
            <span class="text-xs text-subtleText">/{{ prompt.command }}</span>
          </button>
        </div>

        <!-- ── Right panel: tabs (Edit / Injection Settings) ── -->
        <div
          v-if="selectedPrompt || isCreating"
          class="flex flex-col gap-3"
        >
          <!-- Tab bar -->
          <div
            v-if="!isCreating"
            class="flex gap-1 p-0.5 rounded-lg bg-panel border border-borderMuted self-start"
          >
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="
                activeTab === tab.id
                  ? 'bg-accentDim text-accent border border-accentBorder'
                  : 'text-subtleText hover:text-deepText'
              "
              :data-testid="`tab-${tab.id}`"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Edit tab -->
          <div v-show="isCreating || activeTab === 'edit'">
            <PromptEditor
              :prompt="selectedPrompt"
              :is-creating="isCreating"
              :is-saving="isSaving"
              @save="handleSave"
              @change="handleChange"
            />
          </div>

          <!-- Injection Settings tab -->
          <div
            v-if="!isCreating"
            v-show="activeTab === 'injection'"
          >
            <PromptInjectionSettings
              :mode="injectionMode"
              :interval="injectionInterval"
              :position="injectionPosition"
              :include-history="injectionIncludeHistory"
              @update:mode="saveInjectionSetting('promptInjectionMode', $event)"
              @update:interval="saveInjectionSetting('promptInjectionInterval', $event)"
              @update:position="saveInjectionSetting('promptInjectionPosition', $event)"
              @update:include-history="saveInjectionSetting('promptIncludeHistory', $event)"
            />
          </div>

          <!-- Prompt actions -->
          <div
            v-if="selectedPrompt && !isCreating"
            class="flex justify-end gap-2 pt-2"
          >
            <BaseButton
              variant="ghost"
              icon="i-bi:trash"
              text="Delete"
              :is-loading="isDeleting"
              data-testid="delete-prompt-button"
              @click="handleDelete"
            />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { validateSetting } from '@babadeluxe/shared'
import type { PromptInjectionMode, PromptInjectionPosition } from '@babadeluxe/shared'
import { usePrompts } from '@/composables/use-prompts'
import { useSettings } from '@/composables/use-settings'
import { useToastStore } from '@/stores/use-toast-store'
import { toUserMessage } from '@/error-mapper'
import BaseButton from '@/components/BaseButton.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'
import PromptEditor from '@/components/PromptEditor.vue'
import PromptInjectionSettings from '@/components/PromptInjectionSettings.vue'

const { prompts, isLoading, createPrompt, updatePrompt, deletePrompt, fetchPrompts } = usePrompts()
const { settings, upsertSetting, loadSettings } = useSettings()
const toasts = useToastStore()

// ── Prompt selection ─────────────────────────────────────────────────────────
const selectedPromptId = ref<number | undefined>()
const isCreating = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)

const selectedPrompt = computed(() =>
  prompts.value.find((p) => p.id === selectedPromptId.value)
)

function selectPrompt(prompt: { id: number }) {
  isCreating.value = false
  selectedPromptId.value = prompt.id
  activeTab.value = 'edit'
}

function handleNewPrompt() {
  isCreating.value = true
  selectedPromptId.value = undefined
  activeTab.value = 'edit'
}

async function handleSave(payload: { id?: number; name: string; command: string; description?: string; template: string }) {
  isSaving.value = true
  const result = payload.id
    ? await updatePrompt(payload as Required<typeof payload>)
    : await createPrompt(payload)
  isSaving.value = false

  result.match(
    (saved) => {
      toasts.success(payload.id ? 'Prompt updated' : 'Prompt created')
      isCreating.value = false
      selectedPromptId.value = saved.id
    },
    (err) => { toasts.error(toUserMessage(err)) }
  )
}

function handleChange() {}

async function handleDelete() {
  if (!selectedPromptId.value) return
  isDeleting.value = true
  const result = await deletePrompt(selectedPromptId.value)
  isDeleting.value = false
  result.match(
    () => { toasts.success('Prompt deleted'); selectedPromptId.value = undefined },
    (err) => { toasts.error(toUserMessage(err)) }
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const tabs = [
  { id: 'edit' as const, label: 'Edit' },
  { id: 'injection' as const, label: 'Injection Settings' },
]
const activeTab = ref<'edit' | 'injection'>('edit')

// ── Injection settings (read from global settings store) ─────────────────────
const getSetting = (key: string) => settings.value.find((s) => s.settingKey === key)?.settingValue

const injectionMode = computed(() => (getSetting('promptInjectionMode') as PromptInjectionMode) ?? 'always')
const injectionInterval = computed(() => (getSetting('promptInjectionInterval') as number) ?? 5)
const injectionPosition = computed(() => (getSetting('promptInjectionPosition') as PromptInjectionPosition) ?? 'system')
const injectionIncludeHistory = computed(() => (getSetting('promptIncludeHistory') as boolean) ?? true)

async function saveInjectionSetting(key: string, value: unknown) {
  const dataType =
    typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string'

  const validation = validateSetting(key, value)
  if (!validation.success) { toasts.error(validation.error); return }

  const result = await upsertSetting(key, value, dataType)
  result.match(
    () => {},
    (err) => { toasts.error(toUserMessage(err)) }
  )
}

onMounted(async () => {
  await Promise.all([fetchPrompts(), loadSettings()])
})
</script>
