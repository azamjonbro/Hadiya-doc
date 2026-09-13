<script setup>
// "bugun" / "kecha" / a date — the reference's Published column.
function relativeDayFactory(t, locale) {
  return (value) => {
    if (!value) return '—'
    const date = new Date(value)
    const days = Math.floor((Date.now() - date.getTime()) / 86400e3)
    if (days === 0) return t('portal.news.today')
    if (days === 1) return t('news.yesterday')
    return date.toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
  }
}
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { roleLabel } from '@/utils/roleLabel'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { newsApi } from '@/services/news'
import NewsReportPanel from '@/admin/components/NewsReportPanel.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Modal from '@/components/ui/Modal.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import ColumnSettings from '@/components/ui/ColumnSettings.vue'
import { useTableColumns } from '@/composables/useTableColumns'
import { apiErrorText } from '@/utils/apiError'

const { t, te, locale } = useI18n()
const relativeDay = relativeDayFactory(t, locale)
const auth = useAuthStore()
const router = useRouter()

const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const expandedReportId = ref(null)
const search = ref('')

// The reference's columns, behind the ⚙ at the end of the header.
const allColumns = computed(() => [
  { key: 'thumb', label: t('news.columns.thumb') },
  { key: 'title', label: t('news.columns.title') },
  { key: 'published', label: t('news.columns.published') },
  { key: 'audience', label: t('news.columns.audience') },
  { key: 'readers', label: t('news.columns.readers') },
  { key: 'likes', label: t('news.columns.likes') },
  { key: 'comments', label: t('news.columns.comments') },
  { key: 'author', label: t('news.columns.author'), hidden: true },
  { key: 'tags', label: t('news.fields.tags'), hidden: true },
])
const columnSettings = useTableColumns('news', allColumns)
const show = (key) => columnSettings.visible.value.some((c) => c.key === key)
const visibleItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? items.value.filter((item) => item.title.toLowerCase().includes(q)) : items.value
})

const showCreateModal = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({ title: '', content: '', tags: '', departmentTargets: '', roleTargets: [], status: 'DRAFT' })
const roleOptions = Object.values(ROLES)

function toList(value) {
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

function toggleCreateRole(role) {
  const index = createForm.roleTargets.indexOf(role)
  if (index === -1) createForm.roleTargets.push(role)
  else createForm.roleTargets.splice(index, 1)
}

async function loadFirstPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await newsApi.list({})
    items.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  loading.value = true
  try {
    const result = await newsApi.list({ cursor: nextCursor.value })
    items.value = [...items.value, ...result.items]
    nextCursor.value = result.nextCursor
  } finally {
    loading.value = false
  }
}

async function onCreateSubmit() {
  createSubmitting.value = true
  createError.value = ''
  try {
    await newsApi.create({
      title: createForm.title,
      content: createForm.content,
      tags: toList(createForm.tags),
      departmentTargets: toList(createForm.departmentTargets),
      roleTargets: createForm.roleTargets,
      status: createForm.status,
    })
    showCreateModal.value = false
    Object.assign(createForm, { title: '', content: '', tags: '', departmentTargets: '', roleTargets: [], status: 'DRAFT' })
    await loadFirstPage()
  } catch (error) {
    createError.value = apiErrorText(error)
  } finally {
    createSubmitting.value = false
  }
}

const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success' }

onMounted(loadFirstPage)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-[24px] font-semibold text-ink">{{ t('news.title') }}</h1>
      <div class="flex items-center gap-2">
        <AppInput v-model="search" icon="search" class="w-64" :placeholder="t('news.searchTitles')" :aria-label="t('news.searchTitles')" />
        <AppButton v-if="auth.hasPermission('news:create')" icon="plus" @click="showCreateModal = true">{{ t('news.newArticle') }}</AppButton>
      </div>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="i in 4" :key="i" class="h-20 w-full" />
    </div>

    <!-- Rasn 24: thumbnail, title, published, who sees it, readers of
         the audience, ♡, 💬; the ⚙ picks columns; the report opens under
         the row -->
    <div v-else-if="items.length" class="mt-4 overflow-x-auto">
      <table class="w-full min-w-[900px] text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th v-if="show('thumb')" class="w-28 pl-3 pr-2 font-medium">{{ t('news.columns.thumb') }}</th>
            <th v-if="show('title')" class="px-2 font-medium">{{ t('news.columns.title') }}</th>
            <th v-if="show('published')" class="w-32 px-2 font-medium text-ink">{{ t('news.columns.published') }} <Icon name="chevron-down" size="12" class="inline text-ink-faint" /></th>
            <th v-if="show('audience')" class="w-36 px-2 font-medium">{{ t('news.columns.audience') }}</th>
            <th v-if="show('readers')" class="w-32 px-2 font-medium">{{ t('news.columns.readers') }} <Icon name="info" size="12" class="inline text-ink-faint" :title="t('news.columns.readersHint')" /></th>
            <th v-if="show('likes')" class="w-16 px-2"><Icon name="heart" size="16" class="text-ink-muted" :title="t('news.columns.likes')" /></th>
            <th v-if="show('comments')" class="w-16 px-2"><Icon name="message-square" size="16" class="text-ink-muted" :title="t('news.columns.comments')" /></th>
            <th v-if="show('author')" class="w-40 px-2 font-medium">{{ t('news.columns.author') }}</th>
            <th v-if="show('tags')" class="w-40 px-2 font-medium">{{ t('news.fields.tags') }}</th>
            <th class="w-28 pr-3 text-right"><ColumnSettings :columns="columnSettings" /></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in visibleItems" :key="item.id">
            <tr class="group h-[76px] border-b border-border transition-default hover:bg-surface-2">
              <td v-if="show('thumb')" class="pl-3 pr-2">
                <span class="flex h-14 w-24 items-center justify-center overflow-hidden rounded bg-surface-2 text-ink-faint">
                  <img v-if="item.cover" :src="item.cover" alt="" class="h-full w-full object-cover" />
                  <Icon v-else name="image" size="18" />
                </span>
              </td>
              <td v-if="show('title')" class="px-2">
                <button type="button" class="line-clamp-2 text-left text-ink hover:text-primary" @click="router.push(`/bos/news/${item.id}`)">{{ item.title }}</button>
              </td>
              <td v-if="show('published')" class="px-2 text-ink">
                <template v-if="item.status === 'PUBLISHED'">{{ relativeDay(item.publishAt) }}</template>
                <span v-else class="text-ink-muted">{{ t('courses.status.draft') }}</span>
              </td>
              <td v-if="show('audience')" class="px-2 text-ink">
                <template v-if="item.status !== 'PUBLISHED'">—</template>
                <template v-else-if="item.departmentTargets?.length || item.roleTargets?.length">{{ [...(item.departmentTargets ?? []), ...(item.roleTargets ?? []).map((r) => roleLabel(r, { t, te }))].join(', ') }}</template>
                <template v-else>{{ t('common.all') }}</template>
              </td>
              <td v-if="show('readers')" class="px-2 text-ink">
                <template v-if="item.status === 'PUBLISHED'">{{ item.views ?? 0 }} <span class="text-ink-faint">/ {{ item.audience ?? '—' }}</span></template>
                <template v-else>—</template>
              </td>
              <td v-if="show('likes')" class="px-2 text-ink">{{ item.status === 'PUBLISHED' ? item.likes ?? 0 : '—' }}</td>
              <td v-if="show('comments')" class="px-2 text-ink">
                <template v-if="item.status === 'PUBLISHED'">{{ item.comments ?? 0 }} <span v-if="item.comments" class="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" /></template>
                <template v-else>—</template>
              </td>
              <td v-if="show('author')" class="px-2 text-ink-muted">{{ item.authorName || '—' }}</td>
              <td v-if="show('tags')" class="px-2 text-ink-muted">{{ item.tags?.join(', ') || '—' }}</td>
              <td class="pr-3 text-right">
                <span class="flex items-center justify-end gap-1 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="router.push(`/bos/news/${item.id}`)"><Icon name="pencil" size="15" /></button>
                  <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('videoReport.title')" @click="expandedReportId = expandedReportId === item.id ? null : item.id"><Icon name="bar-chart" size="15" /></button>
                </span>
              </td>
            </tr>
            <tr v-if="expandedReportId === item.id" class="border-b border-border">
              <td :colspan="columnSettings.visible.value.length + 1" class="px-3 py-4"><NewsReportPanel :news-id="item.id" /></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <EmptyState v-else icon="newspaper" :title="t('news.empty')" class="mt-6" />

    <div class="mt-4 flex justify-center">
      <AppButton v-if="nextCursor" variant="outline" :loading="loading" @click="loadMore">{{ t('admin.courses.loadMore') }}</AppButton>
    </div>

    <Modal v-model="showCreateModal" :title="t('news.newArticle')" size="lg">
      <form class="space-y-4" @submit.prevent="onCreateSubmit">
        <AppInput v-model="createForm.title" required :label="t('news.fields.title')" />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('news.fields.content') }}</label>
          <textarea v-model="createForm.content" required rows="5" class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AppInput v-model="createForm.tags" :label="t('news.fields.tags')" />
          <AppSelect v-model="createForm.status" :label="t('courses.status.label')" :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }]" />
          <AppInput v-model="createForm.departmentTargets" :label="t('news.fields.departmentTargets')" />
          <div>
            <p class="mb-1.5 text-small font-medium text-ink">{{ t('news.fields.roleTargets') }}</p>
            <div class="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border-strong p-3">
              <label v-for="role in roleOptions" :key="role" class="flex items-center gap-2 text-small text-ink">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border-strong text-primary"
                  :checked="createForm.roleTargets.includes(role)"
                  @change="toggleCreateRole(role)"
                />
                {{ roleLabel(role, { t, te }) }}
              </label>
            </div>
          </div>
        </div>

        <p v-if="createError" class="text-small text-danger">{{ createError }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <AppButton type="button" variant="ghost" @click="showCreateModal = false">{{ t('courses.cancel') }}</AppButton>
          <AppButton type="submit" :loading="createSubmitting">{{ createSubmitting ? t('courses.creating') : t('courses.create') }}</AppButton>
        </div>
      </form>
    </Modal>
  </div>
</template>
