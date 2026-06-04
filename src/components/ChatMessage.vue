<template>
  <div v-bind="$attrs">
    <ReasoningBlock
      v-if="role === 'assistant'"
      :reasoning="reasoning"
      :is-streaming="isStreaming"
      class="mb-2 lg:max-w-80vw ml-12"
    />
    <BaseMessageBubble
      :data-testid="`message-${id}`"
      :variant="role === 'user' ? 'primary' : 'secondary'"
      :align="role === 'user' ? 'right' : 'left'"
      :aria-label="role === 'user' ? 'Your message' : 'Assistant message'"
    >
      <template #avatar>
        <BaseAvatar :role="role" />
      </template>

      <!-- reasoning prop: persisted reasoning loaded from DB by parent.
           currentReasoning: live reasoning chunks from the socket store during streaming.
           Both are shown via ChatReasoningBlock; only one will be non-empty at a time. -->
      <div
        v-if="role === 'assistant' && (reasoning || currentReasoning)"
        class="w-full"
      >
        <ChatReasoningBlock
          :reasoning="reasoning || currentReasoning || ''"
          :is-streaming="isInReasoningPhase"
        />
      </div>

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
            :cursor="isStreaming && role === 'assistant' && !isInReasoningPhase"
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
import ContextBadge from '@/components/ContextBadge.vue'
import ChatReasoningBlock from '@/components/ChatReasoningBlock.vue'
import { getDisambiguatedPaths } from '@/path-disambiguation'
import { useChatSocketStore } from '@/stores/use-chat-socket-store'

defineOptions({ inheritAttrs: false })

type ChatMessageEmitter = {
  delete: [id: number]
  update: [id: number, content: string]
  rewrite: [id: number, model: string]
}

interface ChatMessageProps extends Message {
  isRewriteEnabled?: boolean
  isEditEnabled?: boolean
  /** Persisted reasoning text loaded from the database by the parent component.
   *  Pass `message.reasoning` from the loaded Message record.
   *  During live streaming this will be undefined; live chunks come from the socket store instead. */
  reasoning?: string
}

const props = withDefaults(defineProps<ChatMessageProps>(), {
  isStreaming: false,
  isRewriteEnabled: true,
  isEditEnabled: true,
  reasoning: undefined,
})

const emit = defineEmits<ChatMessageEmitter>()

const socketStore = useChatSocketStore()
const currentReasoning = computed(() => socketStore.reasoningByMessageId.get(props.id))

/** True while the model is in the reasoning phase:
 *  socket is actively streaming AND no final content has arrived yet (`!props.content`).
 *  Once content starts flowing, the reasoning phase is over and the cursor moves to the main block. */
const isInReasoningPhase = computed(() => {
  const state = socketStore.getMessageState(props.id)
  return !!state?.isStreaming && !props.content
})

const markdownRef = useTemplateRef<InstanceType<typeof MarkdownRenderer>>('markdownRef')
const isEditing = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')

defineExpose({ markdownRef })

const contextBadges = computed(() => {
  const isAssistantMessage = props.role === 'assistant'
  if (!isAssistantMessage) return []

  const contextReferences = props.contextReferences ?? []
  const uniqueReferencesMap = new Map<string, ContextReference>()
  const sourceFilePaths: string[] = []

  for (const reference of contextReferences) {
    const uniqueReferenceKey =
      reference.type === 'file'
        ? `file:${reference.filePath}`
        : `snippet:${reference.filePath}:${reference.snippetText}`

    if (!uniqueReferencesMap.has(uniqueReferenceKey)) {
      uniqueReferencesMap.set(uniqueReferenceKey, reference)
      if (reference.filePath) {
        sourceFilePaths.push(reference.filePath)
      }
    }
  }

  const disambiguatedPathsMap = getDisambiguatedPaths(sourceFilePaths)

  return Array.from(uniqueReferencesMap.values()).map((ref) => {
    const isFile = ref.type === 'file'
    const path = ref.filePath ?? ''
    const fileName = getBaseName(path)

    const title = disambiguatedPathsMap.get(path) ?? (path ? fileName : 'Snippet')

    let subtitle = ''
    let tooltip = path

    if (!isFile) {
      const sanitizedSnippet = ref.snippetText.trim().replace(/\s+/g, ' ')
      subtitle =
        sanitizedSnippet.length > 60 ? `${sanitizedSnippet.slice(0, 60)}\u2026` : sanitizedSnippet
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
