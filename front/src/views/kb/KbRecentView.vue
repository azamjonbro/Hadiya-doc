<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { kbApi } from '@/services/kb'
import Skeleton from '@/components/ui/Skeleton.vue'
import KbArticleList from './KbArticleList.vue'

// The API lists newest-updated first; "recent" is that list, unfiltered.
const { t } = useI18n()
const items = ref(null)
onMounted(async () => {
  try {
    items.value = await kbApi.list({ limit: 50 })
  } catch {
    items.value = []
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-[880px] px-4 py-10">
    <h1 class="text-[24px] font-semibold text-ink">{{ t('portal.kb.recent') }}</h1>
    <Skeleton v-if="!items" class="mt-4 h-40 w-full rounded-lg" />
    <KbArticleList v-else :items="items" :empty="t('portal.kb.noArticles')" class="mt-4" />
  </div>
</template>
