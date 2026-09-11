<script setup>
/**
 * Comments moderation (rasn 24's "Комментарии"): every comment on every
 * article, newest first, with the article it sits under and a delete.
 */
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const page = ref(1)
const data = ref(null)

async function load() {
  data.value = null
  try {
    data.value = await newsApi.allComments({ page: page.value, limit: 25 })
  } catch (error) {
    toast.error(apiErrorText(error))
    data.value = { items: [], total: 0, totalPages: 1 }
  }
}

async function remove(comment) {
  const ok = await confirm({ title: t('portal.newsDetail.removeComment'), message: comment.body.slice(0, 120), variant: 'danger' })
  if (!ok) return
  try {
    await newsApi.removeComment(comment.newsId, comment.id)
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}

const when = (value) => new Date(value).toLocaleString(locale.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

watch(page, load)
onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-[24px] font-semibold text-ink">{{ t('portal.newsDetail.comments') }}</h1>
      <p v-if="data" class="text-[13px] text-ink-muted">{{ t('common.total') }}: {{ data.total }}</p>
    </div>

    <div v-if="!data" class="mt-5 space-y-2"><Skeleton v-for="n in 6" :key="n" class="h-14 rounded-lg" /></div>
    <EmptyState v-else-if="!data.items.length" icon="message-square" :title="t('portal.newsDetail.noComments')" class="mt-6" />
    <table v-else class="mt-4 w-full text-[14px]">
      <thead>
        <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
          <th class="pl-3 pr-2 font-medium">{{ t('users.title') }}</th>
          <th class="px-2 font-medium">{{ t('portal.newsDetail.comments') }}</th>
          <th class="w-72 px-2 font-medium">{{ t('nav.news') }}</th>
          <th class="w-40 px-2 font-medium">{{ t('portal.profile.date') }}</th>
          <th class="w-16 pr-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="comment in data.items" :key="comment.id" class="group border-b border-border transition-default last:border-b-0 hover:bg-surface-2">
          <td class="w-56 py-3 pl-3 pr-2">
            <span class="flex items-center gap-2"><Avatar :name="comment.fullName" :src="comment.avatar" size="sm" /><span class="truncate text-ink">{{ comment.fullName }}</span></span>
          </td>
          <td class="px-2 py-3 text-ink">{{ comment.body }}</td>
          <td class="px-2 py-3"><router-link :to="`/bos/news/${comment.newsId}`" class="line-clamp-2 text-ink-muted hover:text-primary">{{ comment.newsTitle }}</router-link></td>
          <td class="px-2 py-3 text-ink-muted">{{ when(comment.createdAt) }}</td>
          <td class="py-3 pr-3 text-right">
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted opacity-0 transition-default hover:bg-surface-hover hover:text-danger focus:opacity-100 group-hover:opacity-100" :aria-label="t('common.delete')" @click="remove(comment)"><Icon name="trash" size="15" /></button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="data && data.totalPages > 1" class="mt-4 flex justify-end">
      <Pagination :page="page" :total-pages="data.totalPages" @update:page="page = $event" />
    </div>
  </div>
</template>
