<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import { useScrollAnalytics } from '@/composables/useScrollAnalytics'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const news = ref(null)

const analytics = useScrollAnalytics(route.params.id)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.getById(route.params.id)
    analytics.start()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => analytics.stop())
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <button type="button" class="text-sm text-slate-500 dark:text-slate-400" @click="router.push('/news')">
      ← {{ t('news.title') }}
    </button>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <template v-else-if="news">
      <h1 class="mt-4 text-2xl font-semibold tracking-tight">{{ news.title }}</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ new Date(news.publishAt).toLocaleString() }}</p>
      <div class="mt-6 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{{ news.content }}</div>
    </template>
  </div>
</template>
