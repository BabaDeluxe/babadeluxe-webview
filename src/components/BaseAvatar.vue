<template>
  <div
    class="flex items-center justify-center shrink-0"
    :class="containerSizeClasses"
  >
    <!-- User Avatar -->
    <img
      v-if="role === 'user' && avatarUrl"
      :src="avatarUrl"
      alt="User Avatar"
      class="object-cover rounded-full"
      :class="imageSizeClasses"
      loading="lazy"
    />

    <!-- User Placeholder -->
    <div
      v-else-if="role === 'user'"
      class="flex items-center justify-center text-subtleText rounded-full"
      :class="imageSizeClasses"
      role="img"
      aria-label="User avatar"
    >
      <i
        class="i-bi:person-circle"
        :class="iconSizeClasses"
        aria-hidden="true"
      />
    </div>

    <!-- Assistant Robot -->
    <div
      v-else
      class="flex items-center justify-center text-accent"
      :class="imageSizeClasses"
      role="img"
      aria-label="Assistant avatar"
    >
      <IconRobot :class="iconSizeClasses" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EnvConfigType } from '@/env-validator'
import { ENV_CONFIG_KEY, LOGGER_KEY } from '@/injection-keys'
import IconRobot from '@/components/IconRobot.vue'
import { useUserAvatar } from '@/composables/use-user-avatar'
import { safeInject } from '@/safe-inject'

const logger = safeInject(LOGGER_KEY)
const envConfig: EnvConfigType = safeInject(ENV_CONFIG_KEY)
const supabaseUrl = envConfig.VITE_SUPABASE_URL ?? ''
const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : ''
if (!projectRef) {
  logger.warn('ProjectRef is unset in during base avatar component init')
}

interface BaseAvatarProps {
  role?: 'user' | 'assistant'
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<BaseAvatarProps>(), {
  role: 'assistant',
  size: 'lg',
})

const containerSizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'w-9 h-9'
    case 'sm':
      return 'w-11 h-11'
    case 'md':
      return 'w-14 h-14'
    case 'lg':
    default:
      return 'w-20 h-20'
  }
})

const imageSizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'w-9 h-9'
    case 'sm':
      return 'w-11 h-11'
    case 'md':
      return 'w-14 h-14'
    case 'lg':
    default:
      return 'w-20 h-20'
  }
})

const iconSizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'w-5 h-5'
    case 'sm':
      return 'w-6 h-6'
    case 'md':
      return 'w-8 h-8'
    case 'lg':
    default:
      return 'w-12 h-12'
  }
})

const avatarUrlRef = useUserAvatar(projectRef)?.avatarUrl
const avatarUrl = avatarUrlRef ? avatarUrlRef.value : undefined
</script>
