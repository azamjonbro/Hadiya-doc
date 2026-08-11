<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'

const { t } = useI18n()
const items = ref([])
const nextCursor = ref(null)
const loading = ref(true)
const errorMessage = ref('')

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await newsApi.feed({})
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
  const result = await newsApi.feed({ cursor: nextCursor.value })
  items.value = [...items.value, ...result.items]
  nextCursor.value = result.nextCursor
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('news.title') }}</h1>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <ul class="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      <li
        v-for="item in items"
        :key="item.id"
        class="cursor-pointer p-4 hover:bg-slate-50 dark:hover:bg-slate-900"
        @click="$router.push(`/news/${item.id}`)"
      >
        <p class="font-medium">{{ item.title }}</p>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ new Date(item.publishAt).toLocaleDateString() }}</p>
      </li>
      <li v-if="!loading && items.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('news.empty') }}
      </li>
    </ul>

    <div class="mt-4 flex justify-center">
      <button
        v-if="nextCursor"
        type="button"
        class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
        @click="loadMore"
      >
        {{ t('courses.loadMore') }}
      </button>
    </div>
  </div>
</template>
