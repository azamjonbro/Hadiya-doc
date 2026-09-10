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

  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-primary flex flex-col justify-center items-center py-24 px-6">
      <div class="absolute inset-0 bg-gradient-to-r from-primary via-primary-hover to-primary"></div>
      <div class="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMnYtNGg0VjRoLTR6TTYuNiAyNy41MmwxLjc2LTMuMy0xLjc2LTMuM0g0LjRsLTEuNzYgMy4zIDEuNzYgMy4zaDIuMnptMjMuNi0xMy4yTDI4LjQ0IDExbDEuNzYtMy4zSDMyLjRsMS43NiAzLjMtMS43NiAzLjNoLTIuMnptMjMuNi0xMy4yTDUyLjA0LS4ybDEuNzYtMy4zSDU2bDEuNzYgMy4zLTEuNzYgMy4zaC0yLjJ6IiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvZz48L3N2Zz4=')]"></div>
      <h1 class="relative z-10 text-3xl md:text-5xl font-bold text-white tracking-widest uppercase text-center drop-shadow-md">
        Bosh direktorning<br/>Murojaati
      </h1>
    </div>

    <!-- Search Band -->
    <div class="bg-surface border-b border-border shadow-sm">
      <div class="mx-auto max-w-[1440px] px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
        <h2 class="text-h2 text-ink">{{ t('news.title') }}</h2>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-ink-faint focus-within:border-primary/50 focus-within:bg-surface focus-within:shadow-sm w-full sm:w-64 transition-default">
            <Icon name="search" size="16" />
            <input type="text" :placeholder="t('users.filters.search')" class="w-full bg-transparent text-small text-ink placeholder:text-ink-muted focus:outline-none" />
          </div>
        </div>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">
      <p v-if="errorMessage" class="mb-4 text-small text-danger">{{ errorMessage }}</p>

      <template v-if="loading">
        <Skeleton class="h-96 w-full rounded-xl" />
        <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton v-for="i in 6" :key="i" class="h-64 w-full rounded-xl" />
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
              class="flex cursor-pointer flex-col overflow-hidden border border-border shadow-sm rounded-xl hover:shadow-md hover:-translate-y-1 transition-all duration-300"
              @click="router.push(`/news/${item.id}`)"
            >
              <div
                class="flex h-48 items-center justify-center bg-surface-2 border-b border-border text-ink-faint"
                :style="item.cover ? `background-image:url(${item.cover});background-size:cover;background-position:center` : ''"
              >
                <Icon v-if="!item.cover" name="newspaper" size="32" />
              </div>
              <div class="flex flex-1 flex-col p-6">
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

        <div v-if="nextCursor" class="mt-10 flex justify-center">
          <AppButton variant="outline" size="lg" @click="loadMore">{{ t('common.loadMore') }}</AppButton>
        </div>
      </template>

      <EmptyState v-else icon="newspaper" :title="t('news.empty')" class="mt-12" />
    </div>
  </div>
</template>
