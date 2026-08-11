<script setup>
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { reportsApi } from '@/services/reports'

const { t } = useI18n()

const REPORT_TYPES = ['employee-progress', 'course-progress', 'video-analytics', 'news-analytics', 'task-analytics']
const FORMATS = ['csv', 'xlsx', 'pdf']

// Keyed by `${type}:${format}` so each individual button shows its own
// loading/error state rather than blocking the whole page.
const pending = reactive({})
const errors = reactive({})

async function onDownload(type, format) {
  const key = `${type}:${format}`
  pending[key] = true
  errors[key] = ''
  try {
    await reportsApi.download(type, format)
  } catch (error) {
    errors[key] = error.response?.data?.message ?? t('reports.error')
  } finally {
    pending[key] = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-10">
    <h1 class="text-2xl font-semibold tracking-tight text-ink">{{ t('reports.title') }}</h1>
    <p class="mt-1 text-sm text-ink-muted">{{ t('reports.subtitle') }}</p>

    <div class="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
      <div v-for="type in REPORT_TYPES" :key="type" class="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p class="text-sm font-medium text-ink">{{ t(`reports.types.${type}`) }}</p>
          <p v-if="errors[`${type}:csv`] || errors[`${type}:xlsx`] || errors[`${type}:pdf`]" class="mt-0.5 text-xs text-red-500">
            {{ errors[`${type}:csv`] || errors[`${type}:xlsx`] || errors[`${type}:pdf`] }}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            v-for="format in FORMATS"
            :key="format"
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm uppercase disabled:opacity-50 dark:border-slate-700"
            :disabled="pending[`${type}:${format}`]"
            @click="onDownload(type, format)"
          >
            {{ pending[`${type}:${format}`] ? t('reports.downloading') : format }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
