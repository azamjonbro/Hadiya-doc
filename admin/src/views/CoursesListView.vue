<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'

const { t } = useI18n()
const auth = useAuthStore()

const filters = reactive({ search: '', status: '' })
const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')

const showCreateForm = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({ title: '', description: '', status: 'DRAFT' })

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

async function onCreateSubmit() {
  createSubmitting.value = true
  createError.value = ''
  try {
    await coursesApi.create({ ...createForm })
    showCreateForm.value = false
    Object.assign(createForm, { title: '', description: '', status: 'DRAFT' })
    await loadFirstPage()
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

onMounted(loadFirstPage)
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-12">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('courses.title') }}</h1>
      <button
        v-if="auth.hasPermission('course:create')"
        type="button"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
        @click="showCreateForm = !showCreateForm"
      >
        {{ showCreateForm ? t('courses.cancel') : t('courses.newCourse') }}
      </button>
    </div>

    <form
      v-if="showCreateForm"
      class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      @submit.prevent="onCreateSubmit"
    >
      <input v-model="createForm.title" required :placeholder="t('courses.fields.title')" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <textarea v-model="createForm.description" :placeholder="t('courses.fields.description')" rows="3" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"></textarea>
      <select v-model="createForm.status" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
        <option value="DRAFT">{{ t('courses.status.draft') }}</option>
        <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
        <option value="ARCHIVED">{{ t('courses.status.archived') }}</option>
      </select>

      <p v-if="createError" class="col-span-2 text-sm text-red-500">{{ createError }}</p>

      <button
        type="submit"
        :disabled="createSubmitting"
        class="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {{ createSubmitting ? t('courses.creating') : t('courses.create') }}
      </button>
    </form>

    <div class="mt-6 flex flex-wrap gap-2">
      <input v-model="filters.search" :placeholder="t('courses.filters.search')" class="rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700" @keyup.enter="loadFirstPage" />
      <select v-model="filters.status" class="rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700" @change="loadFirstPage">
        <option value="">{{ t('courses.filters.allStatuses') }}</option>
        <option value="DRAFT">{{ t('courses.status.draft') }}</option>
        <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
        <option value="ARCHIVED">{{ t('courses.status.archived') }}</option>
      </select>
      <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" @click="loadFirstPage">
        {{ t('courses.filters.apply') }}
      </button>
    </div>

    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <tr>
            <th class="px-4 py-2 font-medium">{{ t('courses.fields.title') }}</th>
            <th class="px-4 py-2 font-medium">{{ t('courses.status.label') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="course in items"
            :key="course.id"
            class="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900"
            @click="$router.push(`/admin/courses/${course.id}`)"
          >
            <td class="px-4 py-2">{{ course.title }}</td>
            <td class="px-4 py-2 text-slate-500 dark:text-slate-400">{{ course.status }}</td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="2" class="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
              {{ t('courses.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-center">
      <button
        v-if="nextCursor"
        type="button"
        :disabled="loading"
        class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
        @click="loadMore"
      >
        {{ loading ? t('courses.loading') : t('courses.loadMore') }}
      </button>
    </div>
  </div>
</template>
