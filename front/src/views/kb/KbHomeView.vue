<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useKb, spaceColor } from '@/composables/useKb'
import { kbApi } from '@/services/kb'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import KbArticleList from './KbArticleList.vue'

/**
 * The overview (reference §5): the title in the middle, one wide search
 * box, and the spaces as cards. Typing in the box turns the page into a
 * result list; `?q=` keeps the query in the URL so the sidebar box and
 * the back button agree.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { categories, loading, loadCategories, createSpaceOpen } = useKb()

const canManage = computed(() => auth.hasPermission('news:manage'))
const spaces = computed(() => categories.value.filter((category) => !category.parentId))

const query = ref(String(route.query.q ?? ''))
const results = ref(null)
const searching = ref(false)
let timer = null

async function search() {
  const q = query.value.trim()
  if (!q) {
    results.value = null
    return
  }
  searching.value = true
  try {
    results.value = await kbApi.list({ search: q, limit: 50 })
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

watch(query, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const q = value.trim()
    if ((route.query.q ?? '') !== q) router.replace({ query: q ? { q } : {} })
    search()
  }, 300)
})
watch(
  () => route.query.q,
  (q) => {
    if (String(q ?? '') !== query.value) query.value = String(q ?? '')
  }
)

onMounted(() => {
  loadCategories().catch(() => {})
  search()
})
</script>

<template>
  <div class="mx-auto w-full max-w-[880px] px-4 py-10">
    <h1 class="text-center text-[28px] font-semibold text-ink">{{ t('portal.nav.kb') }}</h1>
    <label class="relative mx-auto mt-5 block w-full max-w-[380px]">
      <Icon name="search" size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        v-model="query"
        type="search"
        class="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-[13px] text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-primary"
        :placeholder="t('portal.kb.searchPlaceholder')"
      />
    </label>

    <!-- Search results -->
    <template v-if="query.trim()">
      <p class="mt-10 text-[16px] font-medium text-ink">{{ t('portal.kb.results') }}</p>
      <Skeleton v-if="searching && !results" class="mt-3 h-24 w-full rounded-lg" />
      <KbArticleList v-else :items="results ?? []" :empty="t('portal.kb.noResults')" class="mt-3" />
    </template>

    <!-- Spaces -->
    <template v-else>
      <p class="mt-10 text-[16px] font-medium text-ink">{{ t('portal.kb.spaces') }} {{ spaces.length }}</p>
      <div v-if="loading && !spaces.length" class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton v-for="i in 3" :key="i" class="h-[176px] w-full rounded-xl" />
      </div>
      <div v-else class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="space in spaces"
          :key="space.id"
          :to="{ name: 'kb-space', params: { id: space.id } }"
          class="flex h-[176px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-default hover:shadow-md"
        >
          <div class="h-[64px] shrink-0" :style="{ backgroundColor: spaceColor(space.id) }"></div>
          <div class="relative flex-1 px-4 pb-3 pt-6">
            <span class="absolute -top-5 left-4 flex h-10 w-10 items-center justify-center rounded-lg border-2 border-surface text-[16px] font-semibold text-white" :style="{ backgroundColor: spaceColor(space.id) }">
              {{ space.name.slice(0, 1).toUpperCase() }}
            </span>
            <p class="truncate text-[15px] font-semibold text-ink">{{ space.name }}</p>
            <p class="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">{{ space.description }}</p>
            <p class="mt-auto pt-2 text-[12px] text-ink-faint">{{ t('portal.kb.articleCount', { count: space.articleCount }) }}</p>
          </div>
        </RouterLink>

        <button
          v-if="canManage"
          type="button"
          class="flex h-[176px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-[13px] text-ink-muted transition-default hover:border-primary hover:text-primary"
          @click="createSpaceOpen = true"
        >
          <Icon name="plus" size="22" />
          {{ t('portal.kb.newSpace') }}
        </button>

        <p v-if="!spaces.length && !canManage" class="col-span-full py-10 text-center text-[13px] text-ink-muted">{{ t('portal.kb.noSpaces') }}</p>
      </div>
    </template>
  </div>
</template>
