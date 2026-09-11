<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import AppButton from '@/components/ui/AppButton.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import SearchField from '@/components/portal/SearchField.vue'
import { apiErrorText } from '@/utils/apiError'

/**
 * News (reference §3): no hero, a 700px column. A slider of the latest
 * covered articles on top, then the list — first item on a white card,
 * the rest separated by rules — each with a one-line excerpt and the
 * reader count the feed now carries.
 */
const { t, locale } = useI18n()
const router = useRouter()

const items = ref([])
const nextCursor = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const search = ref('')

// Slides: the newest articles that have a cover, at most five. Articles
// without a picture stay in the list only — a text-only slide is a grey box.
const slides = computed(() => items.value.filter((item) => item.cover).slice(0, 5))
const slide = ref(0)
let timer = null

function startTimer() {
  stopTimer()
  if (slides.value.length > 1) timer = setInterval(() => next(), 6000)
}
function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}
function next() {
  slide.value = (slide.value + 1) % slides.value.length
}
function goTo(index) {
  slide.value = index
  startTimer()
}
watch(slides, () => {
  slide.value = 0
  startTimer()
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter((item) => item.title.toLowerCase().includes(q) || item.content?.toLowerCase().includes(q))
})

function excerpt(content) {
  const text = (content ?? '').replace(/[#*_>`\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

function relativeDate(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
  if (days <= 0) return t('portal.news.today')
  if (days < 30) return t('portal.news.daysAgo', { n: days })
  return new Date(value).toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
}

function open(item) {
  router.push(`/news/${item.id}`)
}

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
  // take the whole handler down silently. No toast — the empty end of the
  // list is all the reader needs to see.
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
onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="min-h-screen bg-surface-2 pb-16">
    <div class="mx-auto w-full max-w-[700px] px-4 pt-6">
      <p v-if="errorMessage" class="mb-4 text-small text-danger">{{ errorMessage }}</p>

      <template v-if="loading">
        <Skeleton class="h-[220px] w-full rounded-xl" />
        <Skeleton class="mt-8 h-8 w-40" />
        <Skeleton v-for="i in 4" :key="i" class="mt-4 h-24 w-full rounded-xl" />
      </template>

      <template v-else-if="items.length">
        <!-- Slider -->
        <div
          v-if="slides.length"
          class="relative h-[220px] w-full cursor-pointer overflow-hidden rounded-xl bg-slate-800 shadow-sm"
          @mouseenter="stopTimer"
          @mouseleave="startTimer"
          @click="open(slides[slide])"
        >
          <div
            v-for="(item, index) in slides"
            :key="item.id"
            class="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
            :class="index === slide ? 'opacity-100' : 'opacity-0'"
            :style="{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05) 30%, rgba(0,0,0,.65)), url(${item.cover})` }"
            aria-hidden="true"
          />
          <div class="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 p-6 pb-9">
            <h2 class="line-clamp-2 text-[22px] font-semibold leading-tight text-white drop-shadow">{{ slides[slide].title }}</h2>
            <span class="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-ink">{{ t('common.viewDetails') }}</span>
          </div>
          <div v-if="slides.length > 1" class="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            <button
              v-for="(item, index) in slides"
              :key="item.id"
              type="button"
              class="h-1.5 rounded-full transition-all"
              :class="index === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'"
              :aria-label="item.title"
              @click.stop="goTo(index)"
            />
          </div>
        </div>

        <!-- Title row -->
        <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-[28px] font-semibold text-ink">{{ t('news.title') }}</h1>
          <SearchField v-model="search" width="w-[220px]" />
        </div>

        <!-- List -->
        <div class="mt-4">
          <article
            v-for="(item, index) in filtered"
            :key="item.id"
            class="flex cursor-pointer gap-4"
            :class="index === 0 ? 'rounded-xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.08)]' : 'border-b border-border px-1 py-5 last:border-b-0'"
            @click="open(item)"
          >
            <div class="min-w-0 flex-1">
              <h3 class="text-[18px] font-semibold leading-snug text-ink">{{ item.title }}</h3>
              <p class="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{{ excerpt(item.content) }}</p>
              <div class="mt-3 flex items-center gap-4 text-[13px] text-ink-muted">
                <span class="inline-flex items-center gap-1.5" :class="item.liked ? 'text-danger' : ''"><Icon name="heart" size="16" />{{ item.likes ?? 0 }}</span>
                <span class="inline-flex items-center gap-1.5"><Icon name="message-square" size="16" />{{ item.comments ?? 0 }}</span>
                <span class="inline-flex items-center gap-1.5"><Icon name="eye" size="16" />{{ item.views ?? 0 }}</span>
                <span>{{ relativeDate(item.publishAt) }}</span>
              </div>
            </div>
            <div
              v-if="item.cover"
              class="hidden h-[68px] w-[120px] shrink-0 rounded-md bg-cover bg-center sm:block"
              :style="{ backgroundImage: `url(${item.cover})` }"
              aria-hidden="true"
            />
          </article>
          <p v-if="!filtered.length" class="py-10 text-center text-small text-ink-muted">{{ t('news.empty') }}</p>
        </div>

        <div v-if="nextCursor && !search" class="mt-8 flex justify-center">
          <AppButton variant="outline" @click="loadMore">{{ t('common.loadMore') }}</AppButton>
        </div>
      </template>

      <EmptyState v-else icon="newspaper" :title="t('news.empty')" class="mt-12" />
    </div>
  </div>
</template>
