<script setup>
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'

defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  width: { type: String, default: 'w-[270px]' },
})
defineEmits(['update:modelValue'])
const { t } = useI18n()
</script>

<template>
  <label class="relative block max-w-full" :class="width">
    <Icon name="search" size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
    <input
      :value="modelValue"
      type="search"
      class="h-9 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-small text-ink outline-none transition-default placeholder:text-ink-faint focus:border-primary"
      :placeholder="placeholder || t('portal.search')"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  </label>
</template>
