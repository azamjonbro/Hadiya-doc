<script setup>
/**
 * Banners (rasn 24's "Баннеры"): the published articles with a cover;
 * the pinned ones lead the portal's slider in the order they were pinned.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { newsApi } from '@/services/news'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const { t } = useI18n()
const toast = useToast()
const items = ref(null)
const busy = ref('')

const banners = computed(() => (items.value ?? []).filter((item) => item.pinned).sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt)))
const candidates = computed(() => (items.value ?? []).filter((item) => !item.pinned && item.cover && item.status === 'PUBLISHED'))

async function load() {
  try {
    items.value = (await newsApi.list({ limit: 100 })).items
  } catch (error) {
    toast.error(apiErrorText(error))
    items.value = []
  }
}

async function setPinned(item, pinned) {
  busy.value = item.id
  try {
    const updated = await newsApi.update(item.id, { pinned })
    items.value = items.value.map((row) => (row.id === item.id ? { ...row, ...updated } : row))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <h1 class="text-[24px] font-semibold text-ink">{{ t('news.banners.title') }}</h1>
    <p class="mt-1 max-w-2xl text-[14px] text-ink-muted">{{ t('news.banners.hint') }}</p>

    <div v-if="!items" class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4"><Skeleton v-for="n in 4" :key="n" class="h-40 rounded-xl" /></div>
    <template v-else>
      <section class="mt-6">
        <h2 class="text-[16px] font-semibold text-ink">{{ t('news.banners.active') }} <span class="font-normal text-ink-muted">{{ banners.length }}</span></h2>
        <EmptyState v-if="!banners.length" icon="image" :title="t('news.banners.empty')" class="mt-2" />
        <div v-else class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="(item, index) in banners" :key="item.id" class="overflow-hidden rounded-xl border border-border">
            <div class="relative h-32 bg-cover bg-center" :style="{ backgroundImage: `url(${item.cover})` }">
              <span class="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">{{ index + 1 }}</span>
            </div>
            <div class="p-3">
              <p class="line-clamp-2 text-[14px] text-ink">{{ item.title }}</p>
              <button type="button" class="mt-2 text-[13px] text-danger hover:underline" :disabled="busy === item.id" @click="setPinned(item, false)">{{ t('news.banners.unpin') }}</button>
            </div>
          </div>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="text-[16px] font-semibold text-ink">{{ t('news.banners.candidates') }}</h2>
        <p v-if="!candidates.length" class="mt-2 text-[13px] text-ink-muted">{{ t('news.banners.noCandidates') }}</p>
        <ul v-else class="mt-3 divide-y divide-border">
          <li v-for="item in candidates" :key="item.id" class="flex items-center gap-4 py-3">
            <span class="h-12 w-20 shrink-0 rounded bg-cover bg-center" :style="{ backgroundImage: `url(${item.cover})` }"></span>
            <span class="min-w-0 flex-1 truncate text-[14px] text-ink">{{ item.title }}</span>
            <button type="button" class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] text-ink transition-default hover:bg-surface-2" :disabled="busy === item.id" @click="setPinned(item, true)">
              <Icon name="plus" size="14" />{{ t('news.banners.pin') }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
