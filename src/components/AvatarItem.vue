<template>
  <div class="max-h-14 max-w-14 w-auto h-auto justify-center flex items-center border-r-outset object-cover rounded-full">
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      alt="User Avatar"
      class="object-cover max-h-14 max-w-14 w-auto h-auto border-r-outset object-cover rounded-full"
    >
    <div
      v-else
      class="bg-codeBg flex items-center justify-center text-subtleText"
    >
      <!-- Fallback initials -->
      {{ userInitials }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { inject } from 'vue';
import { IocEnum } from '@/enums/ioc-enum';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabase: SupabaseClient = inject(IocEnum.SUPABASE_CLIENT)!;

const avatarUrl = ref<string | null>(null);
const userInitials = computed(() => {
  // Logic for fallback initials, e.g., from user.full_name or email
  return '??';
});

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.identities?.[0]?.identity_data?.avatar_url) {
    avatarUrl.value = user.identities[0].identity_data.avatar_url;
  }
});
</script>

