<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold text-headingText">Conversation Sync</h3>
      <p class="text-xs text-subtleText">
        Keep your conversations synced across devices via one-way sharded sync.
      </p>
    </div>

    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1.5">
        <label class="text-sm text-subtleText">Storage Backend</label>
        <select
          :value="activeBackend"
          class="bg-panel border border-borderMuted rounded-lg px-3 py-2.5 text-sm outline-none focus:border-accent text-bodyText transition-all"
          @change="handleBackendChange"
        >
          <option value="none">Disabled</option>
          <option
            v-for="b in backends"
            :key="b.id"
            :value="b.id"
          >
            {{ b.label }}
          </option>
        </select>
      </div>

      <div
        v-if="currentBackendConfig"
        class="flex flex-col gap-4 pl-4 border-l-2 border-accent/30"
      >
        <div
          v-for="(row, idx) in currentBackendConfig.fields"
          :key="Array.isArray(row) ? idx : row.key"
          :class="Array.isArray(row) ? 'grid grid-cols-2 gap-4' : ''"
        >
          <template v-if="Array.isArray(row)">
            <BaseInput
              v-for="f in row"
              :key="f.key"
              v-model="localValues[f.key]"
              :label="f.label"
              :type="f.type || 'text'"
              :placeholder="f.placeholder"
              @update:model-value="(v) => handleInput(f.key, String(v))"
            />
          </template>
          <template v-else>
            <BaseInput
              v-model="localValues[row.key]"
              :label="row.label"
              :type="row.type || 'text'"
              :placeholder="row.placeholder"
              @update:model-value="(v) => handleInput(row.key, String(v))"
            />
          </template>
        </div>
      </div>

      <div
        v-if="activeBackend !== 'none'"
        class="flex flex-col gap-3"
      >
        <div class="flex items-center gap-3">
          <BaseButton
            variant="secondary"
            size="sm"
            :loading="testing"
            class="w-fit"
            @click="testConnection"
          >
            Test connection
          </BaseButton>
          <div
            v-if="testResult"
            class="flex items-center gap-1.5 text-xs font-medium"
            :class="testResult.success ? 'text-accent' : 'text-error'"
          >
            <span :class="testResult.success ? 'i-bi:check-circle' : 'i-bi:exclamation-circle'" />
            {{ testResult.message }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import BaseButton from '@/components/BaseButton.vue'
import BaseInput from '@/components/BaseInput.vue'
import type { UserSettingWithValidation } from '@babadeluxe/shared'
import { useSyncStore } from '@/stores/use-sync-store'
import type { SyncBackend } from '@/sync/types'

const props = defineProps<{
  settings: UserSettingWithValidation[]
}>()

const emit = defineEmits<{
  (event: 'field-changed', fieldName: string, value: string): void
}>()

const backends = [
  {
    id: 'github',
    label: 'GitHub',
    fields: [
      {
        key: 'githubToken',
        label: 'Personal Access Token',
        type: 'password',
        placeholder: 'ghp_...',
      },
      [
        { key: 'githubOwner', label: 'Owner', placeholder: 'username' },
        { key: 'githubRepo', label: 'Repository', placeholder: 'repo-name' },
      ],
    ],
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    fields: [
      { key: 'gitlabToken', label: 'GitLab Token', type: 'password', placeholder: 'glpat-...' },
      { key: 'gitlabProjectId', label: 'Project ID', placeholder: '12345678' },
    ],
  },
  {
    id: 'codeberg',
    label: 'Codeberg',
    fields: [
      { key: 'codebergToken', label: 'Codeberg Token', type: 'password' },
      { key: 'codebergRepo', label: 'Repository (owner/repo)', placeholder: 'username/sync-repo' },
    ],
  },
  {
    id: 'azure-devops',
    label: 'Azure DevOps',
    fields: [
      [
        { key: 'azureDevOpsOrg', label: 'Organization' },
        { key: 'azureDevOpsProject', label: 'Project' },
      ],
      { key: 'azureDevOpsRepo', label: 'Repository Name' },
      { key: 'azureDevOpsPat', label: 'Personal Access Token (PAT)', type: 'password' },
    ],
  },
  {
    id: 'webdav',
    label: 'WebDAV (Nextcloud/ownCloud)',
    fields: [
      {
        key: 'webdavUrl',
        label: 'WebDAV URL',
        placeholder: 'https://example.com/remote.php/dav/files/user/',
      },
      [
        { key: 'webdavUsername', label: 'Username' },
        { key: 'webdavPassword', label: 'Password', type: 'password' },
      ],
    ],
  },
] as const

const syncStore = useSyncStore()
const activeBackend = ref<SyncBackend>('none')
const localValues = ref<Record<string, string>>({})

const currentBackendConfig = computed(() => backends.find((b) => b.id === activeBackend.value))

watch(
  () => props.settings,
  (newSettings) => {
    const find = (k: string) =>
      (newSettings.find((s) => s.settingKey === k)?.settingValue as string) || ''
    activeBackend.value = (find('syncBackend') as SyncBackend) || 'none'

    const nextValues: Record<string, string> = {}
    backends.forEach((b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(b.fields as any).flat().forEach((f: any) => {
        nextValues[f.key] = find(f.key)
      })
    })
    localValues.value = nextValues
  },
  { immediate: true, deep: true }
)

const debouncedEmit = useDebounceFn((key: string, value: string) => {
  emit('field-changed', key, value)
}, 800)

function handleInput(key: string, value: string) {
  debouncedEmit(key, value)
}

function handleBackendChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value as SyncBackend
  activeBackend.value = val
  emit('field-changed', 'syncBackend', val)
}

const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

async function testConnection() {
  testing.value = true
  testResult.value = null

  const backend = activeBackend.value
  const config: Record<string, unknown> = { backend }

  const bDef = backends.find((b) => b.id === backend)
  if (!bDef) {
    testing.value = false
    return
  }

  // Map local keys to flat config keys expected by testConnection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(bDef.fields as any).flat().forEach((f: any) => {
    const keyMap: Record<string, string> = {
      githubToken: 'token',
      githubOwner: 'owner',
      githubRepo: 'repo',
      gitlabToken: 'token',
      gitlabProjectId: 'projectId',
      codebergToken: 'token',
      codebergRepo: 'repo',
      azureDevOpsOrg: 'org',
      azureDevOpsProject: 'project',
      azureDevOpsRepo: 'repo',
      azureDevOpsPat: 'pat',
      webdavUrl: 'url',
      webdavUsername: 'username',
      webdavPassword: 'password',
    }
    const targetKey = keyMap[f.key] || f.key
    config[targetKey] = localValues.value[f.key]
  })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await syncStore.testConnection(config as any)
    if (result.isOk()) {
      testResult.value = { success: true, message: 'Connection successful' }
    } else {
      testResult.value = {
        success: false,
        message: `Connection failed: ${result.error.message}`,
      }
    }
  } catch (e) {
    testResult.value = {
      success: false,
      message: `Error: ${e instanceof Error ? e.message : String(e)}`,
    }
  } finally {
    testing.value = false
  }
}
</script>
