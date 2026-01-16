<template>
  <template
    v-for="banner in activeBanners"
    :key="banner.id"
  >
    <BaseAlert
      :message="banner.message"
      :type="banner.type"
      :dismissible="banner.dismissible"
      @close="banner.onClose"
    />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseAlert from '@/components/BaseAlert.vue'

interface BaseAlertItem {
  id: string
  message: string | undefined
  type: 'error' | 'warning'
  dismissible: boolean
  onClose: () => void
}

interface BaseAlertListProps {
  banners: BaseAlertItem[]
}

const props = defineProps<BaseAlertListProps>()

const activeBanners = computed(() => props.banners.filter((banner) => banner.message !== undefined))
</script>
