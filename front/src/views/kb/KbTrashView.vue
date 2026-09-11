<script setup>
/**
 * The knowledge base's trash (rasn 17's "Корзина"): what was deleted,
 * newest first, each with a way back.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { kbApi } from '@/services/kb'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import AppButton from '@/components/ui/AppButton.vue'

const { t, locale } = useI18n()
const toast = useToast()
const items = ref(null)
const busy = ref('')

async function load() {
  try {
    items.value = await kbApi.trash()
  } catch (error) {
    toast.error(apiErrorText(error))
    items.value = []
  }
}

async function restore(article) {
  busy.value = article.id
  try {
    await kbApi.restore(article.id)
    items.value = items.value.filter((row) => row.id !== article.id)
    toast.success(t('portal.kb.restored'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[900px] px-6 py-8">
    <h1 class="text-[28px] font-bold text-ink">{{ t('nav.trash') }}</h1>
    <Skeleton v-if="!items" class="mt-6 h-40 rounded-xl" />
    <p v-else-if="!items.length" class="mt-10 text-center text-[14px] text-ink-muted">{{ t('portal.kb.trashEmpty') }}</p>
    <ul v-else class="mt-6 divide-y divide-border">
      <li v-for="article in items" :key="article.id" class="flex items-center gap-4 py-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted"><Icon name="file-text" size="18" /></span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[15px] text-ink">{{ article.title }}</span>
          <span class="block text-caption text-ink-muted">{{ new Date(article.deletedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
        </span>
        <AppButton size="sm" variant="secondary" icon="refresh" :loading="busy === article.id" @click="restore(article)">{{ t('portal.kb.restore') }}</AppButton>
      </li>
    </ul>
  </div>
</template>
