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

      <template #actions>
        <ChatMessageActions
          v-if="!isEditing"
          :role="role"
          :show-rewrite="showRewrite"
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
import { ref, useTemplateRef } from 'vue'
import type { Message } from '@/database/types'
import BaseMessageBubble from '@/components/BaseMessageBubble.vue'
import BaseEditableText from '@/components/BaseEditableText.vue'
import ChatMessageActions from '@/components/ChatMessageActions.vue'
import MarkdownRenderer from '@/components/ChatMarkdownRenderer.vue'
import BaseAvatar from '@/components/BaseAvatar.vue'
import BaseAlert from '@/components/BaseAlert.vue'

defineOptions({
  inheritAttrs: false,
})

type ChatMessageEmitter = {
  delete: [id: number]
  update: [id: number, content: string]
  rewrite: [id: number, model: string]
}

interface ChatMessageProps extends Message {
  showRewrite?: boolean
}

const props = withDefaults(defineProps<ChatMessageProps>(), {
  isStreaming: false,
  showRewrite: true,
})

const emit = defineEmits<ChatMessageEmitter>()

const markdownRef = useTemplateRef<InstanceType<typeof MarkdownRenderer>>('markdownRef')
const isEditing = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')

defineExpose({ markdownRef })

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
