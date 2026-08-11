<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const filters = reactive({ search: '', status: '' })
const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')

function buildParams(cursor) {
  const params = {}
  if (filters.search) params.search = filters.search
  if (filters.status) params.status = filters.status
  if (cursor) params.cursor = cursor
  return params
}

async function loadFirstPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await coursesApi.list(buildParams())
    items.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  loading.value = true
  try {
    const result = await coursesApi.list(buildParams(nextCursor.value))
    items.value = [...items.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'danger' }

onMounted(loadFirstPage)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-h1 text-ink">{{ t('courses.title') }}</h1>
      <AppButton v-if="auth.hasPermission('course:create')" icon="plus" @click="router.push('/admin/courses/new')">{{ t('courses.newCourse') }}</AppButton>
    </div>

    <div class="mt-5 flex flex-wrap items-end gap-3">
      <div class="w-64">
        <AppInput v-model="filters.search" icon="search" :placeholder="t('courses.filters.search')" @keyup.enter="loadFirstPage" />
      </div>
      <div class="w-48">
        <AppSelect
          v-model="filters.status"
          :placeholder="t('courses.filters.allStatuses')"
          :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }, { value: 'ARCHIVED', label: t('courses.status.archived') }]"
          @update:model-value="loadFirstPage"
        />
      </div>
      <AppButton variant="outline" @click="loadFirstPage">{{ t('courses.filters.apply') }}</AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-52 w-full" />
    </div>

    <div v-else-if="items.length" class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard
        v-for="course in items"
        :key="course.id"
        padding="none"
        hover
        class="flex cursor-pointer flex-col overflow-hidden"
        @click="router.push(`/admin/courses/${course.id}`)"
      >
        <div
          class="flex h-32 items-center justify-center bg-surface-2 text-ink-faint"
          :style="course.cover ? `background-image:url(${course.cover});background-size:cover;background-position:center` : ''"
        >
          <Icon v-if="!course.cover" name="book-open" size="24" />
        </div>
        <div class="flex flex-1 flex-col p-4">
          <Badge :variant="statusBadge[course.status]" size="sm" class="self-start">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</Badge>
          <h3 class="mt-2.5 line-clamp-2 text-small font-semibold text-ink">{{ course.title }}</h3>
          <p v-if="course.description" class="mt-1 line-clamp-2 text-caption text-ink-faint">{{ course.description }}</p>
          <p class="mt-auto pt-3 text-caption text-ink-faint">{{ new Date(course.updatedAt).toLocaleDateString(locale) }}</p>
        </div>
      </AppCard>
    </div>

    <EmptyState v-else icon="book-open" :title="t('courses.empty')" class="mt-6" />

    <div class="mt-6 flex justify-center">
      <AppButton v-if="nextCursor" variant="outline" :loading="loading" @click="loadMore">{{ t('courses.loadMore') }}</AppButton>
    </div>
  </div>
</template>
