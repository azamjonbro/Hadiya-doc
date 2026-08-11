<script setup>
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { reportsApi } from '@/services/reports'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()

const REPORT_TYPES = ['employee-progress', 'course-progress', 'video-analytics', 'news-analytics', 'task-analytics']
const FORMATS = ['csv', 'xlsx', 'pdf']

const typeIcon = {
  'employee-progress': 'users',
  'course-progress': 'graduation-cap',
  'video-analytics': 'video',
  'news-analytics': 'newspaper',
  'task-analytics': 'check-square',
}

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
  <div class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('reports.title') }}</h1>
    <p class="mt-1 text-body text-ink-muted">{{ t('reports.subtitle') }}</p>

    <div class="mt-6 space-y-3">
      <AppCard v-for="type in REPORT_TYPES" :key="type" class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
            <Icon :name="typeIcon[type]" size="17" />
          </span>
          <div>
            <p class="text-small font-semibold text-ink">{{ t(`reports.types.${type}`) }}</p>
            <p v-if="errors[`${type}:csv`] || errors[`${type}:xlsx`] || errors[`${type}:pdf`]" class="mt-0.5 text-caption text-danger">
              {{ errors[`${type}:csv`] || errors[`${type}:xlsx`] || errors[`${type}:pdf`] }}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <AppButton
            v-for="format in FORMATS"
            :key="format"
            variant="outline"
            size="sm"
            icon="download"
            :loading="pending[`${type}:${format}`]"
            @click="onDownload(type, format)"
          >
            {{ format.toUpperCase() }}
          </AppButton>
        </div>
      </AppCard>
    </div>
  </div>
</template>
