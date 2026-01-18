<template>
  <div
    class="flex items-center justify-between p-3 border border-borderMuted rounded-md hover:bg-panel cursor-pointer transition-colors"
    :class="{ 'bg-accent/10 border-accent': isSelected }"
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
      <button
        class="text-subtleText hover:text-accent p-1 transition-colors"
        title="Rename conversation"
        @click.stop="handleRename"
      >
        <i class="i-weui:pencil-outlined" />
      </button>
      <button
        class="text-subtleText hover:text-error p-1 transition-colors"
        title="Delete conversation"
        @click.stop="handleDelete"
      >
        <i class="i-weui:delete-outlined" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { type Conversation } from '@/database/types'
import { useDateFormatter } from '@/composables/use-date-formatter'

interface ConversationListItemProps {
  conversation: Conversation
  messageCount: number
  isSelected?: boolean
}

interface ConversationListItemEmits {
  (event: 'click', conversation: Conversation): void
  (event: 'rename', conversation: Conversation): void
  (event: 'delete', conversation: Conversation): void
}

const props = withDefaults(defineProps<ConversationListItemProps>(), {
  isSelected: false,
})

const emit = defineEmits<ConversationListItemEmits>()

const { formatRelativeDate } = useDateFormatter()

const formattedDate = computed(() => formatRelativeDate(props.conversation.updatedAt))

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
