<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useScrollAnalytics } from '@/composables/useScrollAnalytics'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const loading = ref(true)
const errorMessage = ref('')
const news = ref(null)

// Portal §3: ♡ and 💬 under the article. The like flips optimistically —
// the answer is the server's count, so a double tap settles on the truth.
const liking = ref(false)
const comments = ref([])
const draft = ref('')
const sending = ref(false)
const canModerate = computed(() => auth.hasPermission?.('news:manage') ?? false)

async function toggleLike() {
  if (liking.value) return
  liking.value = true
  try {
    const { liked, likes } = await newsApi.toggleLike(news.value.id)
    news.value = { ...news.value, liked, likes }
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    liking.value = false
  }
}

async function send() {
  const body = draft.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    const created = await newsApi.comment(news.value.id, body)
    comments.value = [...comments.value, created]
    news.value = { ...news.value, comments: comments.value.length }
    draft.value = ''
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    sending.value = false
  }
}

async function removeComment(comment) {
  try {
    await newsApi.removeComment(news.value.id, comment.id)
    comments.value = comments.value.filter((row) => row.id !== comment.id)
    news.value = { ...news.value, comments: comments.value.length }
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}

function formatDate(value) {
  return new Date(value).toLocaleString(locale.value, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

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
    // Not awaited: the article should not wait for its comments.
    newsApi
      .comments(route.params.id)
      .then((items) => (comments.value = items))
      .catch(() => {})
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
          <p v-if="news.subtitle" class="mt-3 max-w-3xl text-[18px] text-white/85">{{ news.subtitle }}</p>
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

      <!-- Reactions row: like (toggle), comment count, readers -->
      <div class="mt-8 flex items-center gap-5 border-t border-border pt-5 text-[14px] text-ink-muted">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 transition-default"
          :class="news.liked ? 'border-danger/40 bg-danger/10 text-danger' : 'border-border hover:border-danger/40 hover:text-danger'"
          :aria-pressed="news.liked"
          :disabled="liking"
          @click="toggleLike"
        >
          <Icon name="heart" size="16" :class="news.liked ? 'fill-current' : ''" />
          <span>{{ news.liked ? t('portal.newsDetail.liked') : t('portal.newsDetail.like') }}</span>
          <span class="tabular-nums">{{ news.likes ?? 0 }}</span>
        </button>
        <span class="inline-flex items-center gap-1.5"><Icon name="message-square" size="16" />{{ news.comments ?? comments.length }}</span>
        <span class="inline-flex items-center gap-1.5"><Icon name="eye" size="16" />{{ news.views ?? 0 }}</span>
      </div>

      <section class="mt-8">
        <h2 class="text-[16px] font-semibold text-ink">{{ t('portal.newsDetail.comments') }} {{ comments.length }}</h2>
        <div class="mt-3 flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar" size="sm" />
          <div class="flex-1">
            <textarea
              v-model="draft"
              rows="2"
              class="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-primary"
              :placeholder="t('portal.newsDetail.commentPlaceholder')"
              maxlength="2000"
            ></textarea>
            <div class="mt-2 flex justify-end">
              <AppButton size="sm" :disabled="!draft.trim()" :loading="sending" @click="send">{{ t('portal.newsDetail.send') }}</AppButton>
            </div>
          </div>
        </div>
        <ul class="mt-3 space-y-3">
          <li v-for="comment in comments" :key="comment.id" class="flex items-start gap-3">
            <Avatar :name="comment.fullName" :src="comment.avatar" size="sm" />
            <div class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2">
              <div class="flex items-start justify-between gap-3">
                <p class="text-[13px] font-semibold text-ink">{{ comment.fullName }}</p>
                <button
                  v-if="comment.userId === auth.user?.id || canModerate"
                  type="button"
                  class="text-ink-faint transition-default hover:text-danger"
                  :aria-label="t('portal.newsDetail.removeComment')"
                  @click="removeComment(comment)"
                >
                  <Icon name="trash" size="14" />
                </button>
              </div>
              <p class="mt-0.5 whitespace-pre-line text-[14px] text-ink">{{ comment.body }}</p>
              <p class="mt-1 text-[12px] text-ink-faint">{{ formatDate(comment.createdAt) }}</p>
            </div>
          </li>
        </ul>
        <p v-if="!comments.length" class="mt-3 text-[13px] text-ink-faint">{{ t('portal.newsDetail.noComments') }}</p>
      </section>
      </div>
    </template>
  </div>
</template>
