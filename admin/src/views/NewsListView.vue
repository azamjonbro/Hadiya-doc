<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { newsApi } from '@/services/news'

const { t } = useI18n()
const auth = useAuthStore()

const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')

const showCreateForm = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({
  title: '',
  content: '',
  tags: '',
  departmentTargets: '',
  roleTargets: '',
  status: 'DRAFT',
})

function toList(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

async function loadFirstPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await newsApi.list({})
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
    const result = await newsApi.list({ cursor: nextCursor.value })
    items.value = [...items.value, ...result.items]
    nextCursor.value = result.nextCursor
  } finally {
    loading.value = false
  }
}

async function onCreateSubmit() {
  createSubmitting.value = true
  createError.value = ''
  try {
    await newsApi.create({
      title: createForm.title,
      content: createForm.content,
      tags: toList(createForm.tags),
      departmentTargets: toList(createForm.departmentTargets),
      roleTargets: toList(createForm.roleTargets),
      status: createForm.status,
    })
    showCreateForm.value = false
    Object.assign(createForm, { title: '', content: '', tags: '', departmentTargets: '', roleTargets: '', status: 'DRAFT' })
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
      <h1 class="text-xl font-semibold tracking-tight">{{ t('news.title') }}</h1>
      <button
        v-if="auth.hasPermission('news:create')"
        type="button"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
        @click="showCreateForm = !showCreateForm"
      >
        {{ showCreateForm ? t('courses.cancel') : t('news.newArticle') }}
      </button>
    </div>

    <form
      v-if="showCreateForm"
      class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      @submit.prevent="onCreateSubmit"
    >
      <input v-model="createForm.title" required :placeholder="t('news.fields.title')" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <textarea v-model="createForm.content" required :placeholder="t('news.fields.content')" rows="5" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"></textarea>
      <input v-model="createForm.tags" :placeholder="t('news.fields.tags')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <select v-model="createForm.status" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
        <option value="DRAFT">{{ t('courses.status.draft') }}</option>
        <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
      </select>
      <input v-model="createForm.departmentTargets" :placeholder="t('news.fields.departmentTargets')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <input v-model="createForm.roleTargets" :placeholder="t('news.fields.roleTargets')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />

      <p v-if="createError" class="col-span-2 text-sm text-red-500">{{ createError }}</p>

      <button
        type="submit"
        :disabled="createSubmitting"
        class="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {{ createSubmitting ? t('courses.creating') : t('courses.create') }}
      </button>
    </form>

    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <ul class="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      <li
        v-for="item in items"
        :key="item.id"
        class="cursor-pointer p-4 hover:bg-slate-50 dark:hover:bg-slate-900"
        @click="$router.push(`/admin/news/${item.id}`)"
      >
        <p class="font-medium">{{ item.title }}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ item.status }}</p>
      </li>
      <li v-if="!loading && items.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('news.empty') }}
      </li>
    </ul>

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
