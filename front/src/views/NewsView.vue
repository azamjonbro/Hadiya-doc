<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()

const items = ref([])
const nextCursor = ref(null)
const loading = ref(true)
const errorMessage = ref('')

function readingMinutes(content) {
  const words = content?.trim().split(/\s+/).length ?? 0
  return Math.max(1, Math.round(words / 180))
}

const featured = computed(() => items.value[0] ?? null)
const rest = computed(() => items.value.slice(1))

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
  <div class="mx-auto max-w-6xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('news.title') }}</h1>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-if="loading">
      <Skeleton class="mt-6 h-72 w-full" />
      <div class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton v-for="i in 6" :key="i" class="h-56 w-full" />
      </div>
    </template>

    <template v-else-if="items.length">
      <!-- Featured -->
      <AppCard padding="none" hover class="mt-6 cursor-pointer overflow-hidden" @click="router.push(`/news/${featured.id}`)">
        <div class="flex flex-col lg:flex-row">
          <div
            class="media-dark flex h-56 shrink-0 items-center justify-center lg:h-auto lg:w-1/2"
            :style="featured.cover ? `background-image:url(${featured.cover});background-size:cover;background-position:center` : ''"
          >
            <Icon v-if="!featured.cover" name="newspaper" size="36" class="text-white/50" />
          </div>
          <div class="flex flex-1 flex-col justify-center p-7">
            <Badge variant="primary" dot>{{ t('news.featured') }}</Badge>
            <h2 class="mt-3 text-h1 text-ink">{{ featured.title }}</h2>
            <p class="mt-3 flex items-center gap-3 text-small text-ink-faint">
              <span>{{ new Date(featured.publishAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
              <span>·</span>
              <span>{{ readingMinutes(featured.content) }} {{ t('common.minRead') }}</span>
            </p>
            <AppButton class="mt-5 self-start" icon="arrow-right" icon-position="right">{{ t('common.viewDetails') }}</AppButton>
          </div>
        </div>
      </AppCard>

      <!-- Latest grid -->
      <section class="mt-10">
        <h2 class="mb-4 text-h3 text-ink">{{ t('news.latest') }}</h2>
        <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AppCard
            v-for="item in rest"
            :key="item.id"
            padding="none"
            hover
            class="flex cursor-pointer flex-col overflow-hidden"
            @click="router.push(`/news/${item.id}`)"
          >
            <div
              class="flex h-36 items-center justify-center bg-surface-2 text-ink-faint"
              :style="item.cover ? `background-image:url(${item.cover});background-size:cover;background-position:center` : ''"
            >
              <Icon v-if="!item.cover" name="newspaper" size="22" />
            </div>
            <div class="flex flex-1 flex-col p-4">
              <h3 class="line-clamp-2 text-small font-semibold text-ink">{{ item.title }}</h3>
              <p class="mt-auto flex items-center gap-2 pt-3 text-caption text-ink-faint">
                <span>{{ new Date(item.publishAt).toLocaleDateString(locale) }}</span>
                <span>·</span>
                <span>{{ readingMinutes(item.content) }} {{ t('common.minRead') }}</span>
              </p>
            </div>
          </AppCard>
        </div>
      </section>

      <div v-if="nextCursor" class="mt-8 flex justify-center">
        <AppButton variant="outline" @click="loadMore">{{ t('common.loadMore') }}</AppButton>
      </div>
    </template>

    <EmptyState v-else icon="newspaper" :title="t('news.empty')" class="mt-6" />
  </div>
</template>
