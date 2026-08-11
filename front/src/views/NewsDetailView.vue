<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import { useScrollAnalytics } from '@/composables/useScrollAnalytics'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

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
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => analytics.stop())
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/news')">
      <Icon name="chevron-left" size="16" />
      {{ t('news.title') }}
    </button>

    <template v-if="loading">
      <Skeleton class="mt-6 h-8 w-3/4" />
      <Skeleton class="mt-3 h-4 w-1/3" />
      <Skeleton class="mt-6 h-64 w-full" />
    </template>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="news">
      <h1 class="mt-5 text-display text-ink">{{ news.title }}</h1>
      <div class="mt-4 flex items-center gap-3 text-small text-ink-faint">
        <span>{{ t('news.publishedOn') }} {{ new Date(news.publishAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
        <span>·</span>
        <span>{{ readingMinutes(news.content) }} {{ t('common.minRead') }}</span>
      </div>

      <div
        v-if="news.cover"
        class="mt-6 h-72 rounded-xl bg-surface-2"
        :style="`background-image:url(${news.cover});background-size:cover;background-position:center`"
      />

      <div class="mt-8 whitespace-pre-wrap text-body leading-relaxed text-ink">{{ news.content }}</div>

      <div v-if="news.tags?.length" class="mt-8 flex flex-wrap gap-2">
        <span v-for="tag in news.tags" :key="tag" class="rounded-full bg-surface-2 px-3 py-1 text-caption font-medium text-ink-muted">#{{ tag }}</span>
      </div>
    </template>
  </div>
</template>
