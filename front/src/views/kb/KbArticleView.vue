<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { kbApi } from '@/services/kb'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Avatar from '@/components/ui/Avatar.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

/**
 * One article: breadcrumb, title, the body (sanitised on the server at
 * write time — see kbSanitize.js), "was this helpful", comments. Opening
 * it is what counts as having read it; there is no separate button.
 */
const { t, locale } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const toast = useToast()

const article = ref(null)
const errorMessage = ref('')
const comments = ref([])
const draft = ref('')
const sending = ref(false)
const rating = ref(false)

async function load() {
  article.value = null
  errorMessage.value = ''
  try {
    article.value = await kbApi.getBySlug(route.params.slug)
    comments.value = await kbApi.comments(article.value.id).catch(() => [])
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  }
}

async function rate(helpful) {
  if (rating.value) return
  rating.value = true
  try {
    await kbApi.rate(article.value.id, helpful)
    const previous = article.value.myFeedback
    if (previous !== helpful) {
      if (previous === true) article.value.helpfulCount -= 1
      if (previous === false) article.value.notHelpfulCount -= 1
      if (helpful) article.value.helpfulCount += 1
      else article.value.notHelpfulCount += 1
      article.value.myFeedback = helpful
    }
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    rating.value = false
  }
}

async function send() {
  const body = draft.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    await kbApi.comment(article.value.id, { body })
    draft.value = ''
    comments.value = await kbApi.comments(article.value.id)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    sending.value = false
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

watch(() => route.params.slug, load)
onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[880px] px-4 py-6">
    <ErrorState v-if="errorMessage" :title="errorMessage" @retry="load" />
    <template v-else-if="!article">
      <Skeleton class="h-5 w-48" />
      <Skeleton class="mt-4 h-9 w-2/3" />
      <Skeleton class="mt-6 h-64 w-full rounded-lg" />
    </template>
    <template v-else>
      <nav class="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <RouterLink :to="{ name: 'kb' }" class="hover:text-ink">{{ t('portal.kb.overview') }}</RouterLink>
        <template v-if="article.categoryId">
          <Icon name="chevron-right" size="12" />
          <RouterLink :to="{ name: 'kb-space', params: { id: article.categoryId } }" class="hover:text-ink">{{ article.categoryName }}</RouterLink>
        </template>
      </nav>

      <article class="mt-4 rounded-xl bg-surface p-8 shadow-sm">
        <h1 class="text-[28px] font-semibold leading-tight text-ink">{{ article.title }}</h1>
        <p class="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-ink-faint">
          <span>{{ formatDate(article.publishedAt || article.updatedAt) }}</span>
          <span class="flex items-center gap-1"><Icon name="eye" size="13" />{{ article.viewCount }}</span>
          <span v-if="article.version > 1">v{{ article.version }}</span>
        </p>
        <p v-if="article.summary" class="mt-4 text-[15px] text-ink-muted">{{ article.summary }}</p>
        <!-- Server-sanitised HTML (allowlist in kbSanitize.js) -->
        <div class="kb-body mt-6 text-[15px] leading-relaxed text-ink" v-html="article.body"></div>

        <div class="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <span class="text-[13px] text-ink-muted">{{ t('portal.kb.helpful') }}</span>
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px]"
            :class="article.myFeedback === true ? 'border-primary bg-primary/10 text-primary' : 'border-border text-ink hover:bg-surface-2'"
            @click="rate(true)"
          >
            <Icon name="check" size="14" />{{ t('portal.kb.yes') }} · {{ article.helpfulCount }}
          </button>
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px]"
            :class="article.myFeedback === false ? 'border-danger bg-danger/10 text-danger' : 'border-border text-ink hover:bg-surface-2'"
            @click="rate(false)"
          >
            <Icon name="close" size="14" />{{ t('portal.kb.no') }} · {{ article.notHelpfulCount }}
          </button>
        </div>
      </article>

      <section class="mt-6">
        <h2 class="text-[16px] font-semibold text-ink">{{ t('portal.kb.comments') }} {{ comments.length }}</h2>
        <div class="mt-3 flex items-start gap-3 rounded-xl bg-surface p-4 shadow-sm">
          <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar" size="sm" />
          <div class="flex-1">
            <textarea
              v-model="draft"
              rows="2"
              class="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-primary"
              :placeholder="t('portal.kb.commentPlaceholder')"
              maxlength="4000"
            ></textarea>
            <div class="mt-2 flex justify-end">
              <AppButton size="sm" :disabled="!draft.trim()" :loading="sending" @click="send">{{ t('portal.kb.send') }}</AppButton>
            </div>
          </div>
        </div>
        <ul class="mt-3 space-y-3">
          <li v-for="comment in comments" :key="comment.id" class="flex items-start gap-3">
            <Avatar :name="comment.fullName" size="sm" />
            <div class="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 shadow-sm">
              <p class="text-[13px] font-semibold uppercase text-ink">{{ comment.fullName }}</p>
              <p class="mt-0.5 whitespace-pre-line text-[14px] text-ink">{{ comment.body }}</p>
              <p class="mt-1 text-[12px] text-ink-faint">{{ formatDate(comment.createdAt) }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.kb-body :deep(h1), .kb-body :deep(h2), .kb-body :deep(h3) { font-weight: 600; margin: 1.25em 0 .5em; }
.kb-body :deep(h1) { font-size: 1.5em; }
.kb-body :deep(h2) { font-size: 1.25em; }
.kb-body :deep(p) { margin: .6em 0; }
.kb-body :deep(ul), .kb-body :deep(ol) { padding-left: 1.5em; margin: .6em 0; }
.kb-body :deep(ul) { list-style: disc; }
.kb-body :deep(ol) { list-style: decimal; }
.kb-body :deep(a) { color: rgb(var(--color-info)); text-decoration: underline; }
.kb-body :deep(img) { max-width: 100%; border-radius: .5rem; }
.kb-body :deep(table) { width: 100%; border-collapse: collapse; margin: 1em 0; }
.kb-body :deep(td), .kb-body :deep(th) { border: 1px solid rgb(var(--color-border)); padding: .4em .6em; }
.kb-body :deep(blockquote) { border-left: 3px solid rgb(var(--color-border)); padding-left: 1em; color: rgb(var(--color-ink-muted)); }
</style>
