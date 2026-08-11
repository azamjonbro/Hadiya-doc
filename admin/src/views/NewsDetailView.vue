<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { newsApi } from '@/services/news'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const news = ref(null)

const form = reactive({
  title: '',
  content: '',
  tags: '',
  departmentTargets: '',
  roleTargets: '',
  status: 'DRAFT',
  expiryAt: '',
})

function toList(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.getById(route.params.id)
    form.title = news.value.title
    form.content = news.value.content
    form.tags = news.value.tags.join(', ')
    form.departmentTargets = news.value.departmentTargets.join(', ')
    form.roleTargets = news.value.roleTargets.join(', ')
    form.status = news.value.status
    form.expiryAt = news.value.expiryAt ? news.value.expiryAt.slice(0, 10) : ''
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.update(route.params.id, {
      title: form.title,
      content: form.content,
      tags: toList(form.tags),
      departmentTargets: toList(form.departmentTargets),
      roleTargets: toList(form.roleTargets),
      status: form.status,
      expiryAt: form.expiryAt ? new Date(form.expiryAt).toISOString() : null,
    })
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  try {
    await newsApi.remove(route.params.id)
    router.push('/admin/news')
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <button type="button" class="text-sm text-slate-500 dark:text-slate-400" @click="router.push('/admin/news')">
      ← {{ t('news.title') }}
    </button>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>

    <template v-else-if="news">
      <h1 class="mt-4 text-xl font-semibold tracking-tight">{{ news.title }}</h1>

      <form class="mt-6 grid grid-cols-2 gap-3" @submit.prevent="onSave">
        <label class="col-span-2 text-sm font-medium">
          {{ t('news.fields.title') }}
          <input v-model="form.title" :disabled="!auth.hasPermission('news:manage')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="col-span-2 text-sm font-medium">
          {{ t('news.fields.content') }}
          <textarea v-model="form.content" :disabled="!auth.hasPermission('news:manage')" rows="6" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"></textarea>
        </label>
        <label class="text-sm font-medium">
          {{ t('news.fields.tags') }}
          <input v-model="form.tags" :disabled="!auth.hasPermission('news:manage')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="text-sm font-medium">
          {{ t('courses.status.label') }}
          <select v-model="form.status" :disabled="!auth.hasPermission('news:manage')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700">
            <option value="DRAFT">{{ t('courses.status.draft') }}</option>
            <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
          </select>
        </label>
        <label class="text-sm font-medium">
          {{ t('news.fields.departmentTargets') }}
          <input v-model="form.departmentTargets" :disabled="!auth.hasPermission('news:manage')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="text-sm font-medium">
          {{ t('news.fields.roleTargets') }}
          <input v-model="form.roleTargets" :disabled="!auth.hasPermission('news:manage')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="col-span-2 text-sm font-medium">
          {{ t('news.fields.expiryAt') }}
          <input v-model="form.expiryAt" type="date" :disabled="!auth.hasPermission('news:manage')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>

        <p v-if="errorMessage" class="col-span-2 text-sm text-red-500">{{ errorMessage }}</p>

        <div v-if="auth.hasPermission('news:manage')" class="col-span-2 flex gap-3">
          <button type="submit" :disabled="saving" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
            {{ saving ? t('courses.saving') : t('courses.save') }}
          </button>
          <button type="button" class="rounded-md border border-red-400 px-4 py-2 text-sm font-medium text-red-500" @click="onDelete">
            {{ t('news.delete') }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
