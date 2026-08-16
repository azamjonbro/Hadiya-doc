<script setup>
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

defineProps({
  message: { type: String, required: true },
})

defineEmits(['retry'])

const { t } = useI18n()
</script>

<template>
  <div class="flex items-start gap-3 rounded-lg border border-border bg-surface p-5">
    <Icon name="alert-triangle" size="18" class="mt-0.5 shrink-0 text-danger" />
    <div class="min-w-0 flex-1">
      <p class="text-small text-ink">{{ message }}</p>
      <AppButton class="mt-3" variant="ghost" size="sm" icon="refresh" @click="$emit('retry')">
        {{ t('admin.common.retry') }}
      </AppButton>
    </div>
  </div>
</template>
