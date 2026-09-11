<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useKb, spaceColor } from '@/composables/useKb'
import { kbApi } from '@/services/kb'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'

/**
 * The knowledge base's own two-column shell (reference §5): a 200px
 * sidebar with the overview link, recent articles, and the tree of
 * spaces; pages render on the right. "Yaratish" appears only for people
 * the API would let write (news:manage) — a button that ends in 403 is
 * worse than no button.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const { categories, loadCategories, createSpaceOpen: spaceModal } = useKb()

const canManage = computed(() => auth.hasPermission('news:manage'))
const spaces = computed(() => categories.value.filter((category) => !category.parentId))
const currentSpaceId = computed(() => (route.name === 'kb-space' ? route.params.id : null))

const sidebarSearch = ref('')
function submitSearch() {
  const q = sidebarSearch.value.trim()
  router.push({ name: 'kb', query: q ? { q } : {} })
}

// ---- create menu: a space (category) or an article ----
const createOpen = ref(false)
const spaceForm = ref({ name: '', description: '' })
const saving = ref(false)

async function createSpace() {
  if (!spaceForm.value.name.trim()) return
  saving.value = true
  try {
    const created = await kbApi.createCategory({
      name: spaceForm.value.name.trim(),
      description: spaceForm.value.description.trim() || undefined,
    })
    await loadCategories(true)
    spaceModal.value = false
    spaceForm.value = { name: '', description: '' }
    router.push({ name: 'kb-space', params: { id: created.id } })
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}

function startArticle() {
  createOpen.value = false
  router.push({ name: 'kb-new', query: currentSpaceId.value ? { space: currentSpaceId.value } : {} })
}

onMounted(() => loadCategories().catch(() => {}))
</script>

<template>
  <div class="flex min-h-[calc(100vh-64px)] bg-surface">
    <!-- Sidebar -->
    <aside class="hidden w-[200px] shrink-0 border-r border-border bg-surface px-3 py-4 md:block">
      <div v-if="canManage" class="relative">
        <button
          type="button"
          class="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary-hover"
          @click="createOpen = !createOpen"
        >
          <Icon name="plus" size="16" />
          {{ t('portal.kb.create') }}
        </button>
        <div v-if="createOpen" class="absolute left-0 top-11 z-20 w-[260px] rounded-xl border border-border bg-surface p-3 shadow-lg">
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-[12px] text-ink hover:bg-surface-2" @click="startArticle">
              <Icon name="file-text" size="20" class="text-primary" />
              {{ t('portal.kb.article') }}
            </button>
            <button type="button" class="flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-[12px] text-ink hover:bg-surface-2" @click="createOpen = false; spaceModal = true">
              <Icon name="grid" size="20" class="text-primary" />
              {{ t('portal.kb.space') }}
            </button>
          </div>
        </div>
      </div>

      <form class="relative mt-3" @submit.prevent="submitSearch">
        <Icon name="search" size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          v-model="sidebarSearch"
          type="search"
          class="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          :placeholder="t('portal.search')"
        />
      </form>

      <nav class="mt-3 space-y-0.5">
        <RouterLink
          :to="{ name: 'kb' }"
          class="flex h-[30px] items-center gap-2 rounded-md px-2 text-[13px] text-ink hover:bg-surface-2"
          :class="route.name === 'kb' ? 'bg-surface-hover font-medium' : ''"
        >
          <Icon name="grid" size="15" class="text-ink-muted" />
          {{ t('portal.kb.overview') }}
        </RouterLink>
        <RouterLink
          :to="{ name: 'kb-recent' }"
          class="flex h-[30px] items-center gap-2 rounded-md px-2 text-[13px] text-ink hover:bg-surface-2"
          :class="route.name === 'kb-recent' ? 'bg-surface-hover font-medium' : ''"
        >
          <Icon name="clock" size="15" class="text-ink-muted" />
          {{ t('portal.kb.recent') }}
        </RouterLink>
      </nav>

      <p class="mt-5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {{ t('portal.kb.spaces') }} {{ spaces.length }}
      </p>
      <ul class="mt-1 space-y-0.5">
        <li v-for="space in spaces" :key="space.id">
          <RouterLink
            :to="{ name: 'kb-space', params: { id: space.id } }"
            class="flex h-[30px] items-center gap-2 rounded-md px-2 text-[13px] text-ink hover:bg-surface-2"
            :class="currentSpaceId === space.id ? 'bg-surface-hover font-medium' : ''"
          >
            <Icon name="chevron-right" size="12" class="shrink-0 text-ink-faint" />
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[12px] font-semibold text-white" :style="{ backgroundColor: spaceColor(space.id) }">
              {{ space.name.slice(0, 1).toUpperCase() }}
            </span>
            <span class="truncate">{{ space.name }}</span>
          </RouterLink>
        </li>
      </ul>
    </aside>

    <!-- Page -->
    <main class="min-w-0 flex-1 bg-surface-2">
      <RouterView />
    </main>

    <Modal v-model="spaceModal" :title="t('portal.kb.newSpace')" size="sm">
      <div class="space-y-4">
        <AppInput v-model="spaceForm.name" :label="t('portal.kb.spaceName')" required maxlength="120" />
        <AppInput v-model="spaceForm.description" :label="t('portal.kb.spaceDescription')" maxlength="255" />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="spaceModal = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="!spaceForm.name.trim()" @click="createSpace">{{ t('portal.kb.createAction') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
