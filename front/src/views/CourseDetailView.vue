<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const course = ref(null)
const topics = ref([])

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    course.value = await coursesApi.getById(route.params.id)
    topics.value = await coursesApi.listTopics(route.params.id)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <button type="button" class="text-sm text-slate-500 dark:text-slate-400" @click="router.push('/courses')">
      ← {{ t('courses.title') }}
    </button>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <template v-else-if="course">
      <h1 class="mt-4 text-xl font-semibold tracking-tight">{{ course.title }}</h1>
      <p class="mt-2 text-slate-500 dark:text-slate-400">{{ course.description }}</p>

      <div class="mt-8">
        <h2 class="text-lg font-semibold tracking-tight">{{ t('courses.topics.title') }}</h2>
        <ul class="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <li v-for="topic in topics" :key="topic.id" class="p-4">
            <p class="font-medium">{{ topic.order }}. {{ topic.title }}</p>
            <p v-if="topic.description" class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ topic.description }}</p>
          </li>
          <li v-if="topics.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {{ t('courses.topics.empty') }}
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
