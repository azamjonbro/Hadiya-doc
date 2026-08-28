<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { reportsApi } from '@/services/reports'
import { usersApi } from '@/services/users'
import { coursesApi } from '@/services/courses'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
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
const userSearch = ref('')
const userResults = ref([])

async function onUserSearch() {
  if (!userSearch.value) {
    userResults.value = []
    return
  }
  const { items } = await usersApi.list({ search: userSearch.value, limit: 5 })
  userResults.value = items
}

function pickUser(user) {
  filters.userId = user.id
  filters.userLabel = user.fullName
  userSearch.value = user.fullName
  userResults.value = []
}

function clearUser() {
  filters.userId = ''
  filters.userLabel = ''
  userSearch.value = ''
  userResults.value = []
}

const hasActiveFilters = computed(() =>
  Boolean(filters.role || filters.courseId || filters.userId || filters.dateFrom || filters.dateTo)
)

function clearFilters() {
  filters.role = ''
  filters.courseId = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  clearUser()
}

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

    <div class="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      <div class="w-44">
        <AppSelect v-model="filters.role" :label="t('reports.filters.role')" :placeholder="t('reports.filters.allRoles')" :options="roleOptions" />
      </div>
      <div class="w-52">
        <AppSelect v-model="filters.courseId" :label="t('reports.filters.course')" :placeholder="t('reports.filters.allCourses')" :options="courseOptions" />
      </div>
      <div class="relative w-56">
        <label class="mb-1.5 block text-small font-medium text-ink">{{ t('reports.filters.user') }}</label>
        <AppInput v-model="userSearch" icon="search" :placeholder="t('reports.filters.userPlaceholder')" @input="onUserSearch">
          <template v-if="filters.userId" #suffix>
            <button type="button" class="text-ink-faint hover:text-ink-muted" @click="clearUser">
              <Icon name="close" size="15" />
            </button>
          </template>
        </AppInput>
        <ul v-if="userResults.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface text-small shadow-md">
          <li v-for="user in userResults" :key="user.id" class="cursor-pointer px-3 py-2 transition-default hover:bg-surface-2" @click="pickUser(user)">
            {{ user.fullName }} <span class="text-ink-faint">({{ user.jshshir }})</span>
          </li>
        </ul>
      </div>
      <!-- Without a placeholder the trigger renders as a bare calendar icon
           and an empty box, which reads as a broken field rather than an
           empty one. -->
      <div class="w-44">
        <AppDatePicker
          v-model="filters.dateFrom"
          :label="t('reports.filters.dateFrom')"
          :placeholder="t('reports.filters.datePlaceholder')"
        />
      </div>
      <div class="w-44">
        <AppDatePicker
          v-model="filters.dateTo"
          :label="t('reports.filters.dateTo')"
          :placeholder="t('reports.filters.datePlaceholder')"
        />
      </div>
      <AppButton v-if="hasActiveFilters" variant="outline" icon="close" @click="clearFilters">
        {{ t('reports.filters.clear') }}
      </AppButton>
    </div>

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
