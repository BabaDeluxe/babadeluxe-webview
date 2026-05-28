<template>
  <section
    data-testid="prompt-injection-section"
    class="flex flex-col gap-4"
  >
    <h2 class="text-xl font-onest font-semibold text-deepText">Prompt Behaviour</h2>
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2 mb-1">
        <span class="i-bi:chat-square-text text-accent text-sm" />
        <span class="text-sm font-medium text-deepText">Injection Mode</span>
      </div>
      <p class="text-xs text-subtleText mb-2">
        When should the system prompt be appended during a conversation?
      </p>

      <div class="flex flex-col border border-borderMuted rounded-lg bg-panel overflow-hidden">
        <div
          v-for="option in injectionModeOptions"
          :key="option.value"
        >
          <button
            type="button"
            class="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-panelHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            :class="{
              'bg-accentDim border-l-2 border-accent': mode === option.value,
              'border-l-2 border-transparent': mode !== option.value,
            }"
            :data-testid="`injection-mode-${option.value}`"
            @click="$emit('update:mode', option.value)"
          >
            <span
              v-if="mode === option.value"
              class="mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-white" />
            </span>

            <span class="flex flex-col gap-0.5 flex-1 min-w-0">
              <span
                class="text-sm font-medium transition-colors"
                :class="mode === option.value ? 'text-accent' : 'text-deepText'"
              >
                {{ option.label }}
              </span>
              <span class="text-xs text-subtleText leading-snug">
                {{ option.description }}
              </span>
            </span>
          </button>
          <div
            v-if="option.value === 'every-x-messages' && mode === 'every-x-messages'"
            class="flex items-center gap-3 px-4 pb-3 pt-1 bg-panelDark"
            data-testid="injection-interval-row"
          >
            <span class="text-xs text-subtleText flex-shrink-0">Interval</span>
            <input
              type="range"
              min="1"
              max="20"
              :value="interval"
              class="flex-1 accent-accent h-1 cursor-pointer"
              data-testid="injection-interval-slider"
              @input="handleIntervalChange"
            />
            <span
              class="text-xs font-semibold text-accent bg-accentDim border border-accentBorder rounded px-2 py-0.5 min-w-[76px] text-center"
            >
              {{ interval }} messages
            </span>
          </div>
        </div>
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2 mb-1">
        <span class="i-bi:layout-text-window text-accent text-sm" />
        <span class="text-sm font-medium text-deepText">Injection Position</span>
      </div>
      <p class="text-xs text-subtleText mb-2">
        Where should the prompt be placed relative to the message array?
      </p>
      <div class="flex gap-2">
        <button
          v-for="pos in injectionPositionOptions"
          :key="pos.value"
          type="button"
          class="flex-1 py-2 px-3 text-xs font-medium rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          :class="
            position === pos.value
              ? 'bg-accentDim border-accent text-accent'
              : 'bg-panel border-borderMuted text-subtleText hover:bg-panelHover'
          "
          :data-testid="`injection-position-${pos.value}`"
          @click="$emit('update:position', pos.value)"
        >
          {{ pos.label }}
        </button>
      </div>
      <p class="text-xs text-subtleText">
        {{ activePositionDescription }}
      </p>
    </div>
    <div class="flex flex-col gap-2">
      <div
        class="flex items-center justify-between p-3 border border-borderMuted rounded-lg bg-panel"
      >
        <div class="flex flex-col">
          <span class="text-deepText font-medium text-sm">Include history on re-inject</span>
          <span class="text-xs text-subtleText"
            >Re-include prior messages when the prompt is re-injected mid-conversation.</span
          >
        </div>
        <BaseButton
          variant="ghost"
          :icon="includeHistory ? 'i-bi:toggle-on' : 'i-bi:toggle-off'"
          :text="includeHistory ? 'On' : 'Off'"
          data-testid="include-history-toggle"
          @click="$emit('update:include-history', !includeHistory)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import type {
  PromptInjectionMode,
  PromptInjectionPosition,
} from '@/services/prompt-injection-service'

const props = defineProps<{
  mode: NonNullable<PromptInjectionMode>
  interval: number
  position: NonNullable<PromptInjectionPosition>
  includeHistory: boolean
}>()

const emit = defineEmits<{
  (event: 'update:mode', value: NonNullable<PromptInjectionMode>): void
  (event: 'update:interval', value: number): void
  (event: 'update:position', value: NonNullable<PromptInjectionPosition>): void
  (event: 'update:include-history', value: boolean): void
}>()

const injectionModeOptions: Array<{
  value: NonNullable<PromptInjectionMode>
  label: string
  description: string
}> = [
  { value: 'always', label: 'Always', description: 'Prepend the prompt to every message sent.' },
  {
    value: 'first-message',
    label: 'First message only',
    description: 'Inject once at the start of each new conversation.',
  },
  {
    value: 'every-x-messages',
    label: 'Every X messages',
    description: 'Re-inject after a set number of messages to keep context fresh.',
  },
  {
    value: 'on-prompt-change',
    label: 'On prompt change',
    description: 'Re-inject automatically when you switch to a different prompt.',
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Never auto-inject — trigger it yourself with the inject button in chat.',
  },
]

const injectionPositionOptions: Array<{
  value: NonNullable<PromptInjectionPosition>
  label: string
  description: string
}> = [
  {
    value: 'system',
    label: 'System',
    description: 'Sent as a dedicated role: "system" message at the top of the thread.',
  },
  {
    value: 'user-prefix',
    label: 'User prefix',
    description: 'Prepended inline to the content of the first user message.',
  },
  {
    value: 'user-suffix',
    label: 'User suffix',
    description: 'Appended inline to the content of the last user message before send.',
  },
]

const activePositionDescription = computed(
  () =>
    injectionPositionOptions.find((position) => position.value === props.position)?.description ??
    ''
)

function handleIntervalChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emit('update:interval', value)
}
</script>
