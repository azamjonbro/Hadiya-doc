<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKb, spaceColor } from '@/composables/useKb'
import { kbApi } from '@/services/kb'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import KbArticleList from './KbArticleList.vue'

/**
 * One space (reference §5): a tinted hero inside the content with the
 * name, description and a search box, then the articles as cards or as
 * a list — the ▦/⇅ toggle on the hero's right.
 */
const { t, locale } = useI18n()
const route = useRoute()
const { categories, loadCategories } = useKb()

const space = computed(() => categories.value.find((category) => category.id === route.params.id) ?? null)
const items = ref(null)
const query = ref('')
const view = ref('grid')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return items.value ?? []
  return (items.value ?? []).filter((item) => item.title.toLowerCase().includes(q) || item.summary?.toLowerCase().includes(q))
})

async function load() {
  items.value = null
  try {
    items.value = await kbApi.list({ categoryId: route.params.id, limit: 100 })
  } catch {
    items.value = []
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

watch(() => route.params.id, load)
onMounted(() => {
  loadCategories().catch(() => {})
  load()
})
</script>

<template>
  <div class="mx-auto w-full max-w-[880px] px-4 py-6">
    <div
      class="relative overflow-hidden rounded-xl px-8 py-8 text-white"
      :style="{ background: `linear-gradient(135deg, ${spaceColor(route.params.id)} 0%, rgba(15,23,42,.85) 100%)` }"
    >
      <p class="text-[12px] text-white/70">{{ t('portal.kb.space') }}</p>
      <h1 class="mt-1 text-[28px] font-semibold">{{ space?.name ?? '…' }}</h1>
      <p v-if="space?.description" class="mt-1 max-w-[520px] text-[13px] text-white/80">{{ space.description }}</p>
      <label class="relative mt-5 block w-full max-w-[380px]">
        <Icon name="search" size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          v-model="query"
          type="search"
          class="h-10 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-faint"
          :placeholder="t('portal.kb.searchInSpace')"
        />
      </label>
      <div class="absolute bottom-4 right-4 flex gap-1 rounded-md bg-white/15 p-0.5">
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded" :class="view === 'grid' ? 'bg-white text-ink' : 'text-white'" :aria-label="t('portal.kb.viewGrid')" @click="view = 'grid'">
          <Icon name="grid" size="14" />
        </button>
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded" :class="view === 'list' ? 'bg-white text-ink' : 'text-white'" :aria-label="t('portal.kb.viewList')" @click="view = 'list'">
          <Icon name="list" size="14" />
        </button>
      </div>
    </div>

    <p class="mt-6 text-[16px] font-medium text-ink">{{ t('portal.kb.articles') }} <span v-if="items">{{ filtered.length }}</span></p>

    <div v-if="!items" class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Skeleton v-for="i in 4" :key="i" class="h-[130px] w-full rounded-lg" />
    </div>
    <div v-else-if="view === 'grid'" class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <RouterLink
        v-for="item in filtered"
        :key="item.id"
        :to="{ name: 'kb-article', params: { slug: item.slug } }"
        class="flex h-[130px] flex-col rounded-lg bg-[#F3F4F6] p-3 transition-default hover:bg-surface-hover dark:bg-surface"
      >
        <Icon name="file-text" size="20" class="text-primary" />
        <p class="mt-2 line-clamp-2 text-[15px] font-medium leading-snug text-ink">{{ item.title }}</p>
        <p class="mt-auto text-[12px] text-ink-faint">{{ t('portal.kb.article') }} • {{ formatDate(item.updatedAt) }}</p>
      </RouterLink>
      <p v-if="!filtered.length" class="col-span-full py-10 text-center text-[13px] text-ink-muted">{{ t('portal.kb.noArticles') }}</p>
    </div>
    <KbArticleList v-else :items="filtered" :empty="t('portal.kb.noArticles')" class="mt-3" />
  </div>
</template>
