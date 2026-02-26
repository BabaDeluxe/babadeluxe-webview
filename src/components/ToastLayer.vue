<template>
  <Teleport to="body">
    <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto"
      >
        <BaseToast
          :message="toast.message"
          :type="toast.type"
          @close="removeToast(toast.id)"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { defineAsyncComponent } from 'vue'
import { useToastStore } from '@/stores/use-toast-store'

// eslint-disable-next-line @typescript-eslint/naming-convention
const BaseToast = defineAsyncComponent(() => import('@/components/BaseToast.vue'))

const store = useToastStore()
const { toasts } = storeToRefs(store)
const { removeToast } = store
</script>
