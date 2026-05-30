<template>
  <section class="flex flex-col gap-4 border-t border-borderMuted pt-6">
    <h2 class="text-xl font-onest font-semibold text-deepText">Synchronization</h2>

    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium text-muted">Active Backend</label>
        <select
          :value="activeBackend"
          class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          @change="handleBackendChange"
        >
          <option value="none">None</option>
          <option value="github">GitHub</option>
          <option value="webdav">WebDAV</option>
          <option value="gitlab">GitLab</option>
          <option value="azure-devops">Azure DevOps</option>
        </select>
      </div>

      <!-- GitHub Settings -->
      <div
        v-if="activeBackend === 'github'"
        class="flex flex-col gap-4 pl-4 border-l-2 border-accent"
      >
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">GitHub Token</label>
          <input
            type="password"
            :value="getSetting('githubToken')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('githubToken', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Owner</label>
          <input
            :value="getSetting('githubOwner')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('githubOwner', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Repo</label>
          <input
            :value="getSetting('githubRepo')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('githubRepo', (e.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <!-- WebDAV Settings -->
      <div
        v-if="activeBackend === 'webdav'"
        class="flex flex-col gap-4 pl-4 border-l-2 border-accent"
      >
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">WebDAV URL</label>
          <input
            :value="getSetting('webdavUrl')"
            placeholder="https://example.com/remote.php/dav/files/user/"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('webdavUrl', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Username</label>
          <input
            :value="getSetting('webdavUsername')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('webdavUsername', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Password</label>
          <input
            type="password"
            :value="getSetting('webdavPassword')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('webdavPassword', (e.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <!-- GitLab Settings -->
      <div
        v-if="activeBackend === 'gitlab'"
        class="flex flex-col gap-4 pl-4 border-l-2 border-accent"
      >
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">GitLab Token</label>
          <input
            type="password"
            :value="getSetting('gitlabToken')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('gitlabToken', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Project ID</label>
          <input
            :value="getSetting('gitlabProjectId')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('gitlabProjectId', (e.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <!-- Azure DevOps Settings -->
      <div
        v-if="activeBackend === 'azure-devops'"
        class="flex flex-col gap-4 pl-4 border-l-2 border-accent"
      >
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Organization</label>
          <input
            :value="getSetting('azureDevOpsOrg')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('azureDevOpsOrg', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Project</label>
          <input
            :value="getSetting('azureDevOpsProject')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="
              (e) => updateSetting('azureDevOpsProject', (e.target as HTMLInputElement).value)
            "
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">Repo Name</label>
          <input
            :value="getSetting('azureDevOpsRepo')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('azureDevOpsRepo', (e.target as HTMLInputElement).value)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted">PAT</label>
          <input
            type="password"
            :value="getSetting('azureDevOpsPat')"
            class="bg-panel border border-borderMuted rounded-lg px-3 py-2 text-sm"
            @input="(e) => updateSetting('azureDevOpsPat', (e.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <div
        v-if="activeBackend !== 'none'"
        class="flex flex-col gap-2"
      >
        <BaseButton
          variant="secondary"
          size="sm"
          :loading="testing"
          @click="testConnection"
        >
          Test connection
        </BaseButton>
        <p
          v-if="testResult"
          :class="testResult.success ? 'text-success' : 'text-error'"
          class="text-xs"
        >
          {{ testResult.message }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import BaseButton from '@/components/BaseButton.vue'
import type { UserSettingWithValidation } from '@babadeluxe/shared'

const props = defineProps<{
  settings: UserSettingWithValidation[]
}>()

const emit = defineEmits<{
  (event: 'field-changed', fieldName: string, value: string): void
}>()

const activeBackend = computed(() => getSetting('syncBackend') || 'none')

const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

function getSetting(key: string): string {
  return (props.settings.find((s) => s.settingKey === key)?.settingValue as string) || ''
}

function updateSetting(key: string, value: string) {
  emit('field-changed', key, value)
}

function handleBackendChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  updateSetting('syncBackend', val)
}

async function testConnection() {
  testing.value = true
  testResult.value = null

  // Simulation for now
  setTimeout(() => {
    testing.value = false
    testResult.value = { success: true, message: 'Connection successful (simulated)' }
  }, 1000)
}
</script>
