<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
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

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()

const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const expandedReportId = ref(null)

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
    errorMessage.value = error.response?.data?.message ?? String(error)
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
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success' }

onMounted(loadFirstPage)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-h1 text-ink">{{ t('news.title') }}</h1>
      <AppButton v-if="auth.hasPermission('news:create')" icon="plus" @click="showCreateModal = true">{{ t('news.newArticle') }}</AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="i in 4" :key="i" class="h-20 w-full" />
    </div>

    <div v-else-if="items.length" class="mt-6 space-y-3">
      <AppCard v-for="item in items" :key="item.id" padding="none">
        <div class="flex items-center justify-between gap-3 p-4">
          <div class="min-w-0 cursor-pointer" @click="router.push(`/bos/news/${item.id}`)">
            <p class="truncate text-small font-medium text-ink">{{ item.title }}</p>
            <p class="mt-1 flex items-center gap-2">
              <Badge :variant="statusBadge[item.status]" size="sm">{{ t(`courses.status.${item.status.toLowerCase()}`) }}</Badge>
              <span class="text-caption text-ink-faint">{{ new Date(item.publishAt).toLocaleDateString(locale) }}</span>
            </p>
          </div>
          <AppButton variant="ghost" size="sm" icon="bar-chart" @click="expandedReportId = expandedReportId === item.id ? null : item.id">
            {{ t('videoReport.title') }}
          </AppButton>
        </div>
        <div v-if="expandedReportId === item.id" class="px-4 pb-4">
          <NewsReportPanel :news-id="item.id" />
        </div>
      </AppCard>
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
                {{ role }}
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
