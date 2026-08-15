<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { notificationsApi } from '@/services/notifications'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()

const items = ref([])
const unreadCount = ref(0)
const nextCursor = ref(null)
const loading = ref(true)
const filter = ref('all') // all | unread

const filtered = computed(() => (filter.value === 'unread' ? items.value.filter((n) => !n.read) : items.value))

const typeMeta = {
  TASK_ASSIGNED: { icon: 'check-square' },
  TASK_DEADLINE_APPROACHING: { icon: 'clock' },
  TASK_OVERDUE: { icon: 'alert-triangle' },
  COURSE_ASSIGNED: { icon: 'graduation-cap' },
  COURSE_DEADLINE_APPROACHING: { icon: 'clock' },
  COURSE_EXPIRED: { icon: 'alert-circle' },
  NEWS_PUBLISHED: { icon: 'newspaper' },
}

const severityStyle = {
  INFO: 'bg-info-subtle text-info',
  WARNING: 'bg-warning-subtle text-warning',
  CRITICAL: 'bg-danger-subtle text-danger',
}

function iconFor(n) {
  return typeMeta[n.type]?.icon ?? 'bell'
}

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return t('notifications.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

async function load() {
  loading.value = true
  try {
    const result = await notificationsApi.list({ limit: 20 })
    items.value = result.items
    unreadCount.value = result.unreadCount
    nextCursor.value = result.nextCursor
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  const result = await notificationsApi.list({ limit: 20, cursor: nextCursor.value })
  items.value = [...items.value, ...result.items]
  nextCursor.value = result.nextCursor
}

async function markRead(n) {
  if (n.read) return
  await notificationsApi.markRead(n.id)
  n.read = true
  unreadCount.value = Math.max(0, unreadCount.value - 1)
}

async function markAllRead() {
  await notificationsApi.markAllRead()
  items.value = items.value.map((n) => ({ ...n, read: true }))
  unreadCount.value = 0
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-h1 text-ink">{{ t('notifications.title') }}</h1>
        <p v-if="unreadCount > 0" class="mt-1 text-small text-ink-muted">{{ unreadCount }} unread</p>
      </div>
      <AppButton variant="ghost" size="sm" icon="check-square" :disabled="unreadCount === 0" @click="markAllRead">
        {{ t('notifications.markAllRead') }}
      </AppButton>
    </div>

    <div class="mt-5 flex items-center gap-1.5">
      <button
        type="button"
        class="rounded-full px-3.5 py-1.5 text-small font-medium transition-default"
        :class="filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-ink-muted hover:bg-surface-hover'"
        @click="filter = 'all'"
      >
        {{ t('notifications.categories.all') }}
      </button>
      <button
        type="button"
        class="rounded-full px-3.5 py-1.5 text-small font-medium transition-default"
        :class="filter === 'unread' ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-ink-muted hover:bg-surface-hover'"
        @click="filter = 'unread'"
      >
        Unread
      </button>
    </div>

    <div class="mt-5 divide-y divide-border rounded-lg border border-border bg-surface">
      <template v-if="loading">
        <div v-for="i in 5" :key="i" class="flex items-start gap-3.5 p-4">
          <Skeleton class="h-9 w-9 rounded-full" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-3.5 w-2/3" />
            <Skeleton class="h-3 w-1/4" />
          </div>
        </div>
      </template>

      <template v-else>
        <div
          v-for="item in filtered"
          :key="item.id"
          class="flex cursor-pointer items-start gap-3.5 p-4 transition-default hover:bg-surface-2"
          @click="markRead(item)"
        >
          <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" :class="severityStyle[item.severity]">
            <Icon :name="iconFor(item)" size="16" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-small text-ink" :class="!item.read ? 'font-medium' : ''">{{ item.title }}</p>
            <p v-if="item.message" class="mt-0.5 text-small text-ink-muted">{{ item.message }}</p>
            <p class="mt-1 text-caption text-ink-faint">{{ timeAgo(item.createdAt) }}</p>
          </div>
          <span v-if="!item.read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
        </div>

        <EmptyState v-if="filtered.length === 0" icon="bell" :title="t('notifications.empty')" />
      </template>
    </div>

    <div v-if="nextCursor" class="mt-4 flex justify-center">
      <AppButton variant="outline" size="sm" @click="loadMore">{{ t('common.loadMore') }}</AppButton>
    </div>
  </div>
</template>
