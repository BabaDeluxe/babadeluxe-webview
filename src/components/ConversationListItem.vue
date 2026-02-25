<template>
  <div
    class="flex items-center justify-between p-3 border border-borderMuted rounded-lg hover:bg-panel cursor-pointer transition-colors"
    :class="{ 'bg-accent/10 border-accent': isSelected }"
    :data-testid="rootTestId"
    @click="handleClick"
  >
    <div class="flex-1">
      <div class="font-medium text-deepText">
        {{ conversation.title }}
      </div>
      <div class="text-sm text-subtleText">
        {{ messageCount }} messages •
        {{ formattedDate }}
      </div>
    </div>
    <div class="flex items-center gap-2">
      <BaseButton
        :data-testid="renameTestId"
        variant="ghost"
        icon="i-weui:pencil-outlined"
        @click.stop="handleRename"
      />
      <BaseButton
        :data-testid="deleteTestId"
        variant="ghost"
        icon="i-weui:delete-outlined"
        class="hover:text-error"
        @click.stop="handleDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { type Conversation } from '@/database/types'
import { useDateFormatter } from '@/composables/use-date-formatter'
import BaseButton from '@/components/BaseButton.vue'

interface ConversationListItemProps {
  conversation: Conversation
  messageCount: number
  isSelected?: boolean
  testIdPrefix?: string
}

interface ConversationListItemEmits {
  (event: 'click', conversation: Conversation): void
  (event: 'rename', conversation: Conversation): void
  (event: 'delete', conversation: Conversation): void
}

const props = withDefaults(defineProps<ConversationListItemProps>(), {
  isSelected: false,
  testIdPrefix: '',
})

const emit = defineEmits<ConversationListItemEmits>()

const { formatRelativeDate } = useDateFormatter()

const formattedDate = computed(() => formatRelativeDate(props.conversation.updatedAt))

const idSuffix = computed(() => props.conversation.id ?? 'unknown')

const rootTestId = computed(() => {
  if (!props.testIdPrefix) return undefined
  return `${props.testIdPrefix}-conversation-${idSuffix.value}`
})

const renameTestId = computed(() => {
  if (!props.testIdPrefix) return undefined
  return `${props.testIdPrefix}-conversation-${idSuffix.value}-rename`
})

const deleteTestId = computed(() => {
  if (!props.testIdPrefix) return undefined
  return `${props.testIdPrefix}-conversation-${idSuffix.value}-delete`
})

const handleClick = () => {
  emit('click', props.conversation)
}

const handleRename = () => {
  emit('rename', props.conversation)
}

const handleDelete = () => {
  emit('delete', props.conversation)
}
</script>
