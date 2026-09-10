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
import { apiErrorText } from '@/utils/apiError'

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
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  // Wrapped rather than left bare: an unhandled rejection here used to
  // take the whole handler down silently. No toast — this runs on every
  // keystroke or scroll, and a banner per failed attempt is worse than
  // the empty list the reader already sees.
  try {
    if (!nextCursor.value) return
    const result = await newsApi.feed({ cursor: nextCursor.value })
    items.value = [...items.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch {
    /* nothing to show; the list simply does not grow */
  }
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
      <AppCard padding="none" hover class="mt-6 cursor-pointer overflow-hidden border border-border shadow-sm" @click="router.push(`/news/${featured.id}`)">
        <div class="flex flex-col lg:flex-row">
          <div
            class="flex h-56 shrink-0 items-center justify-center bg-surface-2 border-r border-border lg:h-auto lg:w-1/2"
            :style="featured.cover ? `background-image:url(${featured.cover});background-size:cover;background-position:center` : ''"
          >
            <Icon v-if="!featured.cover" name="newspaper" size="48" class="text-ink-faint" />
          </div>
          <div class="flex flex-1 flex-col justify-center p-7 lg:p-10">
            <div class="mb-4">
              <Badge variant="primary">{{ t('news.featured') }}</Badge>
            </div>
            <h2 class="text-h1 text-ink leading-tight">{{ featured.title }}</h2>
            <div class="mt-5 flex items-center gap-2 text-small font-medium text-ink-muted">
              <span><Icon name="calendar" size="14" class="inline mr-1" />{{ new Date(featured.publishAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
              <span>·</span>
              <span><Icon name="clock" size="14" class="inline mr-1" />{{ readingMinutes(featured.content) }} {{ t('common.minRead') }}</span>
            </div>
            <AppButton class="mt-6 self-start" icon="arrow-right" icon-position="right">{{ t('common.viewDetails') }}</AppButton>
          </div>
        </div>
      </AppCard>

      <!-- Latest grid -->
      <section class="mt-10 border-t border-border pt-8">
        <h2 class="mb-5 text-h2 text-ink">{{ t('news.latest') }}</h2>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AppCard
            v-for="item in rest"
            :key="item.id"
            padding="none"
            hover
            class="flex cursor-pointer flex-col overflow-hidden border border-border shadow-sm"
            @click="router.push(`/news/${item.id}`)"
          >
            <div
              class="flex h-40 items-center justify-center bg-surface-2 border-b border-border text-ink-faint"
              :style="item.cover ? `background-image:url(${item.cover});background-size:cover;background-position:center` : ''"
            >
              <Icon v-if="!item.cover" name="newspaper" size="24" />
            </div>
            <div class="flex flex-1 flex-col p-5">
              <h3 class="line-clamp-2 text-small font-semibold text-ink leading-snug">{{ item.title }}</h3>
              <div class="mt-auto pt-4 flex items-center gap-1.5 text-caption font-medium text-ink-muted">
                <span>{{ new Date(item.publishAt).toLocaleDateString(locale) }}</span>
                <span>·</span>
                <span>{{ readingMinutes(item.content) }} {{ t('common.minRead') }}</span>
              </div>
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
