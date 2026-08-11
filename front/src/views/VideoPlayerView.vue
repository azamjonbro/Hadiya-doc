<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { http } from '@/services/http'
import VideoPlayer from '@/video/VideoPlayer.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const video = ref(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await http.get(`/videos/${route.params.id}`)
    video.value = data.data
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
    <button type="button" class="text-sm text-slate-500 dark:text-slate-400" @click="router.back()">
      ← {{ t('courses.title') }}
    </button>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <template v-else-if="video">
      <h1 class="mt-4 text-xl font-semibold tracking-tight">{{ video.title }}</h1>
      <p v-if="video.description" class="mt-2 text-slate-500 dark:text-slate-400">{{ video.description }}</p>

      <div class="mt-6">
        <VideoPlayer v-if="video.processingStatus === 'READY'" :video-id="video.id" />
        <p v-else class="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {{ t(`videos.processing.${video.processingStatus}`) }}
        </p>
      </div>
    </template>
  </div>
</template>
