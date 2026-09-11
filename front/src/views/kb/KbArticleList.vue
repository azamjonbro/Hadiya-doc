<script setup>
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'

/**
 * Article rows (reference §5 "So'nggilar"): a file square, the title, a
 * one-line summary, the date on the right. Used by recent, search and a
 * space's list view.
 */
defineProps({
  items: { type: Array, required: true },
  empty: { type: String, default: '' },
})
const { locale } = useI18n()
function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-border bg-surface">
    <RouterLink
      v-for="item in items"
      :key="item.id"
      :to="{ name: 'kb-article', params: { slug: item.slug } }"
      class="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"><Icon name="file-text" size="16" /></span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[14px] font-medium text-ink">{{ item.title }}</span>
        <span v-if="item.summary" class="block truncate text-[12px] text-ink-muted">{{ item.summary }}</span>
      </span>
      <span class="shrink-0 text-[12px] text-ink-faint">{{ formatDate(item.updatedAt) }}</span>
    </RouterLink>
    <p v-if="!items.length" class="px-4 py-10 text-center text-[13px] text-ink-muted">{{ empty }}</p>
  </div>
</template>
