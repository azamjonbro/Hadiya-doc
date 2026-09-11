<script setup>
/**
 * Content analytics (rasn 19): three figures — views, articles, share of
 * positive votes — then the table: article with its space, author,
 * views, "N of audience" who opened it, and the 👍 share with a bar.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { kbApi } from '@/services/kb'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SearchField from '@/components/portal/SearchField.vue'

const { t } = useI18n()
const data = ref(null)
const error = ref('')
const search = ref('')

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value?.items ?? []).filter((row) => !q || row.title.toLowerCase().includes(q))
})

onMounted(async () => {
  try {
    data.value = await kbApi.analytics()
  } catch (e) {
    error.value = apiErrorText(e)
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-8">
    <h1 class="text-[28px] font-bold text-ink">{{ t('portal.kb.analyticsTitle') }}</h1>
    <div class="mt-4"><SearchField v-model="search" width="w-[300px]" /></div>

    <Skeleton v-if="!data && !error" class="mt-6 h-64 rounded-xl" />
    <p v-else-if="error" class="mt-6 text-small text-danger">{{ error }}</p>
    <template v-else>
      <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div class="grid grid-cols-2 divide-x divide-border rounded-2xl border border-border p-6">
          <div class="pr-6">
            <p class="flex items-center gap-2 text-[14px] text-ink-muted"><Icon name="eye" size="16" />{{ t('portal.kb.totalViews') }}</p>
            <p class="mt-2 text-[28px] font-semibold text-ink">{{ data.totalViews }}</p>
          </div>
          <div class="pl-6">
            <p class="flex items-center gap-2 text-[14px] text-ink-muted"><Icon name="file-text" size="16" />{{ t('portal.kb.materials') }}</p>
            <p class="mt-2 text-[28px] font-semibold text-ink">{{ data.total }}</p>
          </div>
        </div>
        <div class="rounded-2xl border border-border p-6">
          <p class="flex items-center gap-2 text-[14px] text-ink-muted"><Icon name="check-circle" size="16" />{{ t('portal.kb.positive') }}</p>
          <div class="mt-2 flex items-center gap-3">
            <p class="text-[28px] font-semibold text-ink">{{ data.positivePercent == null ? '—' : `${data.positivePercent}%` }}</p>
            <div v-if="data.positivePercent != null" class="h-2 flex-1 overflow-hidden rounded-full bg-danger/20"><div class="h-full rounded-full bg-primary/30" :style="{ width: `${data.positivePercent}%` }"></div></div>
          </div>
        </div>
      </div>

      <table class="mt-6 w-full text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th class="pl-3 pr-2 font-medium">{{ t('portal.kb.article') }}</th>
            <th class="w-40 px-2 font-medium">{{ t('portal.kb.author') }}</th>
            <th class="w-28 px-2 font-medium text-ink">{{ t('portal.kb.views') }} <Icon name="chevron-down" size="12" class="inline text-ink-faint" /></th>
            <th class="w-40 px-2 font-medium">{{ t('portal.kb.usersViewed') }}</th>
            <th class="w-44 pr-3 font-medium"><Icon name="check" size="14" class="inline" /></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="h-16 border-b border-border last:border-b-0 hover:bg-surface-2">
            <td class="pl-3 pr-2">
              <span class="flex items-center gap-3">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary"><Icon name="file-text" size="15" /></span>
                <span class="min-w-0">
                  <RouterLink :to="{ name: 'kb-article', params: { slug: row.slug } }" class="block truncate text-ink hover:text-primary">{{ row.title }}</RouterLink>
                  <span class="block truncate text-caption text-ink-muted">{{ row.spaceName || '—' }}</span>
                </span>
              </span>
            </td>
            <td class="px-2 text-ink">{{ row.authorName || '—' }}</td>
            <td class="px-2 text-ink">{{ row.viewCount }}</td>
            <td class="px-2 text-ink">{{ row.usersViewed }} <span class="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink-muted">{{ t('portal.kb.ofAudience', { total: data.audience }) }}</span></td>
            <td class="pr-3">
              <span v-if="row.helpfulPercent != null" class="flex items-center gap-2">
                <span class="w-10 text-ink">{{ row.helpfulPercent }}%</span>
                <span class="h-2 flex-1 overflow-hidden rounded-full bg-danger/20"><span class="block h-full rounded-full bg-primary/30" :style="{ width: `${row.helpfulPercent}%` }"></span></span>
              </span>
              <span v-else class="text-ink-faint">—</span>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="5" class="py-10 text-center text-small text-ink-muted">{{ t('portal.kb.noArticles') }}</td></tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
