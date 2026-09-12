<script setup>
/**
 * The bin. Deleting something in the admin app does not drop it — it lands
 * here and stays recoverable for the retention window (30 days), because a
 * course deletion cascades into topics, videos, assignments and analytics,
 * and one mis-clicked confirmation should not be the end of it. From here it
 * is either put back or, for a SUPERADMIN, destroyed early.
 *
 * Anything past the window is swept when this page loads — the server does it
 * on read, so the count below can shrink on a visit.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { trashApi } from '@/services/trash'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()

const items = ref([])
const retentionDays = ref(30)
const loading = ref(true)
const errorMessage = ref('')
const busyId = ref(null)

// Emptying the bin is deliberately narrower than filling it: the same role
// split the API enforces, mirrored here so the button is not offered to
// someone who would only get a 403.
const canDestroy = auth.isSuperAdmin

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await trashApi.list()
    items.value = result.items
    retentionDays.value = result.retentionDays
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

function keyOf(entry) {
  return `${entry.type}:${entry.id}`
}

// How long this entry has left before the sweep takes it.
function daysLeft(entry) {
  const ms = new Date(entry.expiresAt) - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

async function onRestore(course) {
  busyId.value = keyOf(course)
  try {
    await trashApi.restore(course.type, course.id)
    toast.success(t('trash.restored', { title: course.title }))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busyId.value = null
  }
}

async function onDestroy(course) {
  if (!(await confirm.ask({ message: t('trash.destroyConfirm', { title: course.title }) }))) return
  busyId.value = keyOf(course)
  try {
    await trashApi.destroy(course.type, course.id)
    toast.success(t('trash.destroyed', { title: course.title }))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busyId.value = null
  }
}

function deletedLabel(date) {
  return new Date(date).toLocaleString(locale.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <h1 class="text-[24px] font-semibold text-ink">{{ t('trash.title') }}</h1>
    <p class="mt-1 text-body text-ink-muted">{{ t('trash.subtitle', { days: retentionDays }) }}</p>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="i in 3" :key="i" class="h-20 w-full" />
    </div>

    <div v-else-if="items.length" class="mt-6 space-y-3">
      <AppCard v-for="course in items" :key="keyOf(course)" class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-faint">
            <Icon :name="course.type === 'NEWS' ? 'newspaper' : 'book-open'" size="17" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-small font-semibold text-ink">{{ course.title }}</p>
            <p class="truncate text-caption text-ink-faint">
              {{ t('trash.types.' + course.type) }} ·
              {{ t('trash.deletedAt') }}: {{ deletedLabel(course.deletedAt) }}
              <span v-if="course.deletedByName"> · {{ course.deletedByName }}</span>
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <!-- The clock is the point of the page: an entry is only as safe as
               the days it has left. -->
          <Badge :variant="daysLeft(course) <= 3 ? 'warning' : 'neutral'" size="sm">
            {{ t('trash.daysLeft', { days: daysLeft(course) }) }}
          </Badge>
          <AppButton size="sm" variant="outline" icon="refresh" :loading="busyId === keyOf(course)" @click="onRestore(course)">
            {{ t('trash.restore') }}
          </AppButton>
          <AppButton
            v-if="canDestroy"
            size="sm"
            variant="danger"
            icon="trash"
            :loading="busyId === keyOf(course)"
            @click="onDestroy(course)"
          >
            {{ t('trash.destroy') }}
          </AppButton>
        </div>
      </AppCard>
    </div>

    <EmptyState v-else icon="trash" :title="t('trash.empty')" :description="t('trash.emptyHint')" class="mt-6" />
  </div>
</template>
