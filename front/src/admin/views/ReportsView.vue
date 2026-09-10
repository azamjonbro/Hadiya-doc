<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { reportsApi } from '@/services/reports'
import { coursesApi } from '@/services/courses'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()

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

const roleOptions = Object.values(ROLES).map((r) => ({ value: r, label: r }))
const courseOptions = ref([])

const filters = reactive({ role: '', courseId: '', userId: '', userLabel: '', dateFrom: '', dateTo: '' })

const filterFields = computed(() => [
  { key: 'role', type: 'select', label: t('reports.filters.role'), placeholder: t('reports.filters.allRoles'), options: roleOptions },
  {
    key: 'courseId',
    type: 'select',
    width: 'w-52',
    label: t('reports.filters.course'),
    placeholder: t('reports.filters.allCourses'),
    options: courseOptions.value,
  },
  {
    key: 'userId',
    type: 'user',
    width: 'w-56',
    displayKey: 'userLabel',
    label: t('reports.filters.user'),
    placeholder: t('reports.filters.userPlaceholder'),
  },
  // Without a placeholder the date trigger renders as a bare calendar icon
  // and an empty box, which reads as a broken field rather than an empty one.
  { key: 'dateFrom', type: 'date', label: t('reports.filters.dateFrom'), placeholder: t('reports.filters.datePlaceholder') },
  { key: 'dateTo', type: 'date', label: t('reports.filters.dateTo'), placeholder: t('reports.filters.datePlaceholder') },
])

async function loadCourseOptions() {
  try {
    const { items } = await coursesApi.list({ limit: 100 })
    courseOptions.value = items.map((c) => ({ value: c.id, label: c.title }))
  } catch {
    courseOptions.value = []
  }
}

async function onDownload(type, format) {
  const key = `${type}:${format}`
  pending[key] = true
  errors[key] = ''
  try {
    await reportsApi.download(type, format, {
      // The file is written in whatever language the admin is reading, so a
      // report handed to a colleague needs no explaining.
      lang: locale.value,
      role: filters.role,
      userId: filters.userId,
      courseId: filters.courseId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    })
  } catch (error) {
    errors[key] = apiErrorText(error, t('reports.error'))
  } finally {
    pending[key] = false
  }
}

onMounted(loadCourseOptions)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('reports.title') }}</h1>
    <p class="mt-1 text-body text-ink-muted">{{ t('reports.subtitle') }}</p>

    <FilterBar
      v-model="filters"
      class="mt-6 rounded-lg border border-border bg-surface p-4"
      align="end"
      :fields="filterFields"
      :clear-label="t('reports.filters.clear')"
    />

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
