<template>
  <div
    class="flex flex-col gap-5"
    data-testid="prompt-injection-settings"
  >
    <!-- ── Injection Mode ───────────────────────────────────────── -->
    <div class="flex flex-col gap-2">
      <label class="text-sm text-subtleText">Injection Mode</label>

      <div class="flex flex-col gap-1.5">
        <button
          v-for="opt in modeOptions"
          :key="opt.value"
          type="button"
          class="flex flex-col gap-0.5 px-3.5 py-3 rounded-lg border text-left transition-colors"
          :class="
            localMode === opt.value
              ? 'border-accent bg-accentDim text-deepText'
              : 'border-borderMuted bg-panel text-deepText hover:border-accent/50'
          "
          :data-testid="`injection-mode-${opt.value}`"
          @click="selectMode(opt.value)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ opt.label }}</span>
            <!-- active indicator -->
            <span
              v-if="localMode === opt.value"
              class="w-2 h-2 rounded-full bg-accent flex-shrink-0"
            />
          </div>
          <span class="text-xs text-subtleText">{{ opt.description }}</span>

          <!-- Interval sub-row (only when every-x-messages is selected) -->
          <Transition name="slide-down">
            <div
              v-if="opt.value === 'every-x-messages' && localMode === 'every-x-messages'"
              class="mt-2.5 pt-2.5 border-t border-borderMuted flex items-center gap-3"
              @click.stop
            >
              <span class="text-xs text-subtleText whitespace-nowrap">Re-inject every</span>
              <input
                v-model.number="localInterval"
                type="range"
                min="1"
                max="20"
                step="1"
                class="flex-1 accent-accent h-1 cursor-pointer"
                data-testid="injection-interval-slider"
                @change="emitInterval"
              />
              <span
                class="text-xs font-semibold text-accent bg-accentDim border border-accentBorder rounded px-2 py-0.5 min-w-[4.5rem] text-center tabular-nums"
              >
                {{ localInterval }} {{ localInterval === 1 ? 'message' : 'messages' }}
              </span>
            </div>
          </Transition>
        </button>
      </div>
    </div>

    <!-- ── Injection Position ────────────────────────────────────── -->
    <div class="flex flex-col gap-2">
      <label class="text-sm text-subtleText">Injection Position</label>
      <div class="flex gap-1.5">
        <button
          v-for="pos in positionOptions"
          :key="pos.value"
          type="button"
          class="flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-center transition-colors"
          :class="
            localPosition === pos.value
              ? 'border-accent bg-accentDim text-deepText'
              : 'border-borderMuted bg-panel text-deepText hover:border-accent/50'
          "
          :data-testid="`injection-position-${pos.value}`"
          @click="selectPosition(pos.value)"
        >
          <span class="text-xs font-semibold">{{ pos.label }}</span>
          <span class="text-xs text-subtleText">{{ pos.hint }}</span>
        </button>
      </div>
    </div>

    <!-- ── Conversation Behaviour ────────────────────────────────── -->
    <div
      v-if="showHistoryToggle"
      class="flex flex-col gap-2"
    >
      <label class="text-sm text-subtleText">Conversation Behaviour</label>

      <div
        class="flex items-start justify-between p-3.5 rounded-lg border border-borderMuted bg-panel gap-4"
      >
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-medium text-deepText">Re-include history on re-inject</span>
          <span class="text-xs text-subtleText">
            When the prompt re-injects mid-conversation, keep prior messages as context. Disable to
            start fresh with only the new prompt.
          </span>
        </div>
        <!-- Toggle -->
        <button
          type="button"
          role="switch"
          :aria-checked="localIncludeHistory"
          class="relative flex-shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          :class="localIncludeHistory ? 'bg-accent' : 'bg-borderMuted'"
          data-testid="include-history-toggle"
          @click="toggleHistory"
        >
          <span
            class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
            :class="localIncludeHistory ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <!-- ── Info callout ──────────────────────────────────────────── -->
    <div
      v-if="infoText"
      class="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border border-accentBorder bg-accentDim text-xs text-subtleText"
    >
      <span class="i-bi:info-circle text-accent flex-shrink-0 mt-px" />
      <span>{{ infoText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '../services/prompt-injection-service'
import { PROMPT_INJECTION_DEFAULTS } from '../services/prompt-injection-service'

interface Props {
  mode?: PromptInjectionMode
  interval?: number
  position?: PromptInjectionPosition
  includeHistory?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'always',
  interval: 5,
  position: 'system',
  includeHistory: true,
})

const emit = defineEmits<{
  'update:mode': [value: PromptInjectionMode]
  'update:interval': [value: number]
  'update:position': [value: PromptInjectionPosition]
  'update:includeHistory': [value: boolean]
}>()

// Local state for instant feedback before the settings round-trip.
const localMode = ref<PromptInjectionMode>(props.mode ?? PROMPT_INJECTION_DEFAULTS.mode)
const localInterval = ref(props.interval ?? PROMPT_INJECTION_DEFAULTS.interval)
const localPosition = ref<PromptInjectionPosition>(
  props.position ?? PROMPT_INJECTION_DEFAULTS.position
)
const localIncludeHistory = ref(props.includeHistory ?? PROMPT_INJECTION_DEFAULTS.includeHistory)

// Sync when parent updates (e.g., settings loaded from server).
watch(
  () => props.mode,
  (v) => {
    if (v) localMode.value = v
  }
)
watch(
  () => props.interval,
  (v) => {
    if (v) localInterval.value = v
  }
)
watch(
  () => props.position,
  (v) => {
    if (v) localPosition.value = v
  }
)
watch(
  () => props.includeHistory,
  (v) => {
    if (v !== undefined) localIncludeHistory.value = v
  }
)

// ── Options ──────────────────────────────────────────────────────────────────

const modeOptions: { value: PromptInjectionMode; label: string; description: string }[] = [
  { value: 'always', label: 'Always', description: 'Prepend the prompt to every message sent.' },
  {
    value: 'first-message',
    label: 'First message only',
    description: 'Inject once at the start of each new conversation.',
  },
  {
    value: 'every-x-messages',
    label: 'Every N messages',
    description: 'Re-inject automatically after a set number of messages.',
  },
  {
    value: 'on-prompt-change',
    label: 'On prompt change',
    description: 'Re-inject automatically when you switch the active prompt mid-conversation.',
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Never auto-inject — use the "/inject" command to trigger it yourself.',
  },
]

const positionOptions: { value: PromptInjectionPosition; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'role: system message' },
  { value: 'user-prefix', label: 'User prefix', hint: 'Prepended to user msg' },
  { value: 'user-suffix', label: 'User suffix', hint: 'Appended to user msg' },
]

// ── Derived ──────────────────────────────────────────────────────────────────

const showHistoryToggle = computed(
  () => localMode.value === 'every-x-messages' || localMode.value === 'on-prompt-change'
)

const infoText = computed<string | null>(() => {
  if (localMode.value === 'every-x-messages') {
    return `The prompt re-injects after every ${localInterval.value} messages, keeping the model aligned as the conversation grows longer.`
  }
  if (localMode.value === 'manual') {
    return 'Use /inject in the chat to insert the prompt whenever you need it.'
  }
  return null
})

// ── Handlers ─────────────────────────────────────────────────────────────────

function selectMode(value: PromptInjectionMode) {
  localMode.value = value
  emit('update:mode', value)
}

function emitInterval() {
  emit('update:interval', localInterval.value)
}

function selectPosition(value: PromptInjectionPosition) {
  localPosition.value = value
  emit('update:position', value)
}

function toggleHistory() {
  localIncludeHistory.value = !localIncludeHistory.value
  emit('update:includeHistory', localIncludeHistory.value)
}
</script>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  max-height: 8rem;
}
</style>
