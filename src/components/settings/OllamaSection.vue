<template>
  <div
    class="space-y-4"
    data-testid="ollama-section"
  >
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-medium">Ollama</h3>
    </div>

    <div class="space-y-4">
      <div class="grid gap-2">
        <label
          for="ollama-url"
          class="text-sm font-medium"
          >Server URL</label
        >
        <div class="flex gap-2">
          <BaseInput
            id="ollama-url"
            v-model="ollamaUrl"
            placeholder="http://localhost:11434"
            class="flex-1"
            :status="urlStatus"
            :error="urlError"
            data-testid="ollama-url-input"
          />
          <BaseButton
            variant="secondary"
            :disabled="isTesting || !isValidUrl"
            class="shrink-0"
            data-testid="ollama-test-button"
            @click="handleTestConnection"
          >
            <BaseSpinner
              v-if="isTesting"
              size="small"
              class="mr-2"
            />
            Test connection
          </BaseButton>
        </div>
        <p class="text-xs text-secondary-foreground/60">
          The base URL of your Ollama server. Ensure Ollama is running and accessible.
        </p>
      </div>

      <div
        v-if="testResult"
        class="p-2 rounded text-sm flex items-center gap-2"
        :class="testResult.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'"
        data-testid="ollama-test-result"
      >
        <div :class="testResult.success ? 'i-bi:check-circle' : 'i-bi:exclamation-circle'" />
        {{ testResult.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { NetworkError } from '@/errors'
import BaseInput from '@/components/BaseInput.vue'
import BaseButton from '@/components/BaseButton.vue'
import BaseSpinner from '@/components/BaseSpinner.vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const ollamaUrl = computed({
  get: () => props.modelValue,
  set: (val) => {
    emit('update:modelValue', val)
  },
})

const isTesting = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const urlError = ref<string>()
const urlStatus = computed(() => (urlError.value ? 'invalid' : 'idle'))

const isValidUrl = computed(() => {
  if (!ollamaUrl.value) return false
  try {
    new URL(ollamaUrl.value)
    return true
  } catch {
    return false
  }
})

watch(ollamaUrl, () => {
  testResult.value = null
  urlError.value = undefined
})

async function testConnection(url: string): Promise<Result<void, NetworkError>> {
  try {
    const targetUrl = url.endsWith('/') ? `${url}api/tags` : `${url}/api/tags`
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      return err(
        new NetworkError(`Ollama returned error: ${response.status} ${response.statusText}`)
      )
    }

    return ok(undefined)
  } catch (unknownError) {
    return err(
      new NetworkError(
        'Failed to connect to Ollama. Ensure it is running and CORS is configured.',
        unknownError instanceof Error ? unknownError : undefined
      )
    )
  }
}

async function handleTestConnection() {
  if (!isValidUrl.value) return

  isTesting.value = true
  testResult.value = null

  const result = await testConnection(ollamaUrl.value)

  isTesting.value = false
  result.match(
    () => {
      testResult.value = { success: true, message: 'Successfully connected to Ollama!' }
    },
    (networkError) => {
      testResult.value = { success: false, message: networkError.message }
    }
  )
}
</script>
