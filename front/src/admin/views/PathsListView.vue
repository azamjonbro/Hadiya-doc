<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pathsApi } from '@/services/paths'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const items = ref([])
const loading = ref(true)
const kind = ref('')
const status = ref('')

const KINDS = ['GENERAL', 'ONBOARDING', 'CERTIFICATION', 'DEVELOPMENT']

async function load() {
  loading.value = true
  try {
    items.value = await pathsApi.list({ kind: kind.value || undefined, status: status.value || undefined })
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loading.value = false
  }
}

async function create() {
  try {
    const path = await pathsApi.create({ title: t('pathBuilder.untitled'), kind: 'GENERAL' })
    router.push(`/bos/paths/${path.id}`)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  }
}

async function remove(path) {
  const ok = await confirm({ title: t('pathBuilder.deleteTitle'), message: t('pathBuilder.deleteMessage', { title: path.title }) })
  if (!ok) return
  try {
    await pathsApi.remove(path.id)
    await load()
    toast.success(t('pathBuilder.deleted'))
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  }
}

const statusVariant = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'warning' }

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('paths.adminTitle') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('paths.adminSubtitle') }}</p>
      </div>
      <AppButton icon="plus" @click="create">{{ t('paths.newPath') }}</AppButton>
    </div>

    <div class="mt-5 flex flex-wrap gap-3">
      <AppSelect
        v-model="kind"
        class="w-52"
        :placeholder="t('paths.allKinds')"
        :options="KINDS.map((value) => ({ value, label: t(`paths.kind.${value}`) }))"
        @update:model-value="load"
      />
      <AppSelect
        v-model="status"
        class="w-44"
        :placeholder="t('paths.allStatuses')"
        :options="['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((value) => ({ value, label: t(`paths.status.${value}`) }))"
        @update:model-value="load"
      />
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-xl" />
    </div>
    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="layers"
      :title="t('paths.adminEmpty')"
      :description="t('paths.adminEmptyHint')"
    />
    <div v-else class="mt-6 space-y-3">
      <AppCard v-for="path in items" :key="path.id" class="flex flex-wrap items-center justify-between gap-4 p-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate font-medium text-ink">{{ path.title }}</p>
            <Badge :variant="statusVariant[path.status]" size="sm">{{ t(`paths.status.${path.status}`) }}</Badge>
            <Badge variant="neutral" size="sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
          </div>
          <p class="mt-0.5 text-small text-ink-muted">
            {{ t('paths.stepCount', { count: path.requiredCount }) }}
            <template v-if="path.itemCount !== path.requiredCount">
              · {{ t('paths.optionalCount', { count: path.itemCount - path.requiredCount }) }}
            </template>
            <template v-if="path.sequential"> · {{ t('paths.sequential') }}</template>
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <AppButton variant="secondary" size="sm" icon="pencil" @click="router.push(`/bos/paths/${path.id}`)">
            {{ t('common.edit') }}
          </AppButton>
          <AppButton variant="ghost" size="sm" icon="trash" @click="remove(path)" />
        </div>
      </AppCard>
    </div>
  </div>
</template>
