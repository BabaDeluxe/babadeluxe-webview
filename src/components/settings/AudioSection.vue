<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <h3 class="text-sm font-semibold text-deepText uppercase tracking-wider">
        Audio
      </h3>
      <p class="text-xs text-subtleText">
        Configure text-to-speech settings.
      </p>
    </div>

    <div class="flex flex-col gap-4 bg-panel border border-borderMuted/30 rounded-xl p-4">
      <div class="flex flex-col gap-2">
        <label class="text-xs font-medium text-subtleText">Voice</label>
        <select
          :value="ttsVoice"
          @change="e => setVoice((e.target as HTMLSelectElement).value)"
          class="w-full bg-slate border border-borderMuted rounded-lg px-3 py-2 text-sm text-deepText focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="af_heart">af_heart (Female)</option>
          <option value="af_alloy">af_alloy (Female)</option>
          <option value="af_aoede">af_aoede (Female)</option>
          <option value="af_fable">af_fable (Female)</option>
          <option value="am_adam">am_adam (Male)</option>
          <option value="am_echo">am_echo (Male)</option>
          <option value="am_eric">am_eric (Male)</option>
          <option value="am_fenrir">am_fenrir (Male)</option>
        </select>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useTts } from '@/composables/use-tts'

const { ttsVoice, setVoice } = useTts()
</script>
