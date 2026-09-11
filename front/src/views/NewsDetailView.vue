<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import { useScrollAnalytics } from '@/composables/useScrollAnalytics'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const news = ref(null)

const analytics = useScrollAnalytics(route.params.id)

function readingMinutes(content) {
  const words = content?.trim().split(/\s+/).length ?? 0
  return Math.max(1, Math.round(words / 180))
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    news.value = await newsApi.getById(route.params.id)
    analytics.start()
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => analytics.stop())
</script>

<template>

  <div class="min-h-screen bg-bg pb-12">
    <template v-if="loading">
      <div class="mx-auto max-w-6xl px-6 py-8 mt-12 space-y-3">
        <Skeleton class="h-10 w-64" />
        <Skeleton class="h-64 w-full rounded-xl" />
      </div>
    </template>

    <div v-else-if="errorMessage" class="mx-auto max-w-3xl px-6 py-12">
      <p class="mt-4 text-small text-danger">{{ errorMessage }}</p>
    </div>

    <template v-else-if="news">
      <!-- Full Width Hero Banner -->
      <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10" :style="news.cover ? `background-image:url(${news.cover});background-size:cover;background-position:center` : ''">
        <div class="absolute inset-0 bg-gradient-to-t from-slate-900 to-slate-900/40" :class="!news.cover ? 'from-indigo-900 via-purple-900 to-indigo-800' : ''"></div>
        <div v-if="!news.cover" class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')]"></div>
        
        <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
          <button type="button" class="mb-6 flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white" @click="router.push('/news')">
            <Icon name="chevron-left" size="16" />
            {{ t('news.title') }}
          </button>
          
          <h1 class="text-4xl lg:text-5xl font-bold text-white leading-tight drop-shadow-md">{{ news.title }}</h1>
          <div class="mt-4 flex flex-wrap items-center gap-3 text-small text-white/80 font-medium">
            <span class="flex items-center"><Icon name="calendar" size="14" class="mr-1.5" />{{ new Date(news.publishAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
            <span>·</span>
            <span class="flex items-center"><Icon name="clock" size="14" class="mr-1.5" />{{ readingMinutes(news.content) }} {{ t('common.minRead') }}</span>
          </div>
        </div>
      </div>

      <div class="mx-auto w-full max-w-[960px] px-6 lg:px-8 pt-12 pb-16">

      <div class="whitespace-pre-wrap text-[17px] leading-loose text-ink/90 font-medium">{{ news.content }}</div>

      <div v-if="news.tags?.length" class="mt-10 flex flex-wrap gap-2 pt-6 border-t border-border">
        <span v-for="tag in news.tags" :key="tag" class="rounded border border-border bg-surface-2 px-3 py-1 text-caption font-semibold text-ink-muted">#{{ tag }}</span>
      </div>
      </div>
    </template>
  </div>
</template>
