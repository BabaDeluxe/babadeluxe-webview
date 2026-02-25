<template>
  <div v-bind="$attrs">
    <BaseMessageBubble
      :data-testid="`message-${id}`"
      :variant="role === 'user' ? 'primary' : 'secondary'"
      :align="role === 'user' ? 'right' : 'left'"
    >
      <template #avatar>
        <BaseAvatar :role="role" />
      </template>

      <BaseEditableText
        :content="content"
        :is-editing="isEditing"
        :is-saving="isSaving"
        @save="handleSave"
        @cancel="handleCancel"
      >
        <template #content>
          <MarkdownRenderer
            ref="markdownRef"
            :content="content"
            :cursor="isStreaming && role === 'assistant'"
            :is-streaming="isStreaming"
          />
        </template>
      </BaseEditableText>

      <div
        v-if="contextBadges.length > 0"
        class="mt-3 w-full min-w-0 flex flex-col gap-2 items-stretch"
      >
        <ContextBadge
          v-for="badge in contextBadges"
          :key="badge.key"
          :title="badge.title"
          :subtitle="badge.subtitle"
          :icon="badge.icon"
          :show-actions="false"
          :full-tooltip="badge.tooltip"
          class="w-full self-stretch"
        />
      </div>

      <template #actions>
        <ChatMessageActions
          v-if="!isEditing"
          :role="role"
          :message-content="content"
          :is-edit-enabled="props.isEditEnabled && role === 'user'"
          :is-rewrite-enabled="props.isRewriteEnabled && role === 'assistant'"
          :is-delete-enabled="true"
          @edit="startEdit"
          @delete="handleDelete"
          @rewrite="handleRewrite"
        />
      </template>
    </BaseMessageBubble>

    <BaseAlert
      v-if="errorMessage"
      :message="errorMessage"
      @close="errorMessage = ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { Message, ContextReference } from '@/database/types'
import BaseMessageBubble from '@/components/BaseMessageBubble.vue'
import BaseEditableText from '@/components/BaseEditableText.vue'
import ChatMessageActions from '@/components/ChatMessageActions.vue'
import MarkdownRenderer from '@/components/ChatMarkdownRenderer.vue'
import BaseAvatar from '@/components/BaseAvatar.vue'
import BaseAlert from '@/components/BaseAlert.vue'
import ContextBadge from '@/components/ContextBadge.vue'
import { getDisambiguatedPaths } from '@/path-disambiguation'

defineOptions({ inheritAttrs: false })

type ChatMessageEmitter = {
  delete: [id: number]
  update: [id: number, content: string]
  rewrite: [id: number, model: string]
}

interface ChatMessageProps extends Message {
  isRewriteEnabled?: boolean
  isEditEnabled?: boolean
}

const props = withDefaults(defineProps<ChatMessageProps>(), {
  isStreaming: false,
  isRewriteEnabled: true,
  isEditEnabled: true,
})

const emit = defineEmits<ChatMessageEmitter>()

const markdownRef = useTemplateRef<InstanceType<typeof MarkdownRenderer>>('markdownRef')
const isEditing = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')

defineExpose({ markdownRef })

const contextBadges = computed(() => {
  if (props.role !== 'assistant') return []
  const refs = props.contextReferences ?? []

  const uniqueRefs = new Map<string, ContextReference>()
  const filePaths: string[] = []

  for (const ref of refs) {
    const key =
      ref.type === 'file' ? `file:${ref.filePath}` : `snippet:${ref.filePath}:${ref.snippetText}`

    if (!uniqueRefs.has(key)) {
      uniqueRefs.set(key, ref)
      if (ref.filePath) filePaths.push(ref.filePath)
    }
  }

  const displayMap = getDisambiguatedPaths(filePaths)

  return Array.from(uniqueRefs.values()).map((ref) => {
    const isFile = ref.type === 'file'
    const path = ref.filePath ?? ''
    const fileName = getBaseName(path)

    const title = displayMap.get(path) ?? (path ? fileName : 'Snippet')

    let subtitle = ''
    let tooltip = path

    if (!isFile) {
      const preview = ref.snippetText.trim().replace(/\s+/g, ' ')
      subtitle = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview
      tooltip = path ? `${path}\n\n${ref.snippetText}` : ref.snippetText
    }

    return {
      key: isFile ? `file:${path}` : `snippet:${ref.snippetText.slice(0, 20)}`,
      title,
      subtitle,
      tooltip,
      icon: isFile ? 'i-bi:file-earmark-code' : 'i-bi:code-square',
    }
  })
})

function getBaseName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? filePath
}

function startEdit() {
  isEditing.value = true
}

function handleCancel() {
  isEditing.value = false
  isSaving.value = false
}

function handleSave(newContent: string) {
  isSaving.value = true
  errorMessage.value = ''
  emit('update', props.id, newContent)
  isEditing.value = false
  isSaving.value = false
}

function handleDelete() {
  errorMessage.value = ''
  emit('delete', props.id)
}

function handleRewrite(modelId: string) {
  emit('rewrite', props.id, modelId)
}
</script>
