<script setup>
/**
 * Everything one person has to do, in one place.
 *
 * The obligations come from four collections — a session, a course due
 * date, a task, a programme deadline — and the point of the page is that
 * nobody has to remember to check four screens.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { calendarApi } from '@/services/calendar'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()

const items = ref([])
const loading = ref(true)
const downloading = ref(false)

// Complete literal class strings — Tailwind's scanner cannot see a class
// assembled at runtime, so `bg-${variant}-subtle` would ship without the
// rule and render as an unstyled square.
const kindMeta = {
  EVENT: { icon: 'calendar', tone: 'bg-primary-subtle text-primary' },
  COURSE_DEADLINE: { icon: 'book-open', tone: 'bg-warning-subtle text-warning' },
  TASK_DEADLINE: { icon: 'check-square', tone: 'bg-info-subtle text-info' },
  PATH_DEADLINE: { icon: 'layers', tone: 'bg-success-subtle text-success' },
}

// Grouped by day, because "what is happening on Thursday" is the question
// people actually bring to a calendar.
const days = computed(() => {
  const buckets = new Map()
  for (const entry of items.value) {
    const key = new Date(entry.startAt).toISOString().slice(0, 10)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(entry)
  }
  return [...buckets.entries()].map(([key, entries]) => ({ key, date: new Date(key), entries }))
})

function formatDay(date) {
  return date.toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTime(entry) {
  if (entry.allDay) return t('calendar.allDay')
  return new Date(entry.startAt).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
}

function open(entry) {
  // The url the server built is absolute; the router needs the path.
  const path = entry.url?.replace(/^https?:\/\/[^/]+/, '')
  if (path) router.push(path)
}

async function load() {
  loading.value = true
  try {
    const result = await calendarApi.list()
    items.value = result.items
  } catch (error) {
    toast.error(apiErrorText(error, t('calendar.loadError')))
  } finally {
    loading.value = false
  }
}

async function download() {
  downloading.value = true
  try {
    await calendarApi.download()
  } catch (error) {
    toast.error(apiErrorText(error, t('calendar.downloadError')))
  } finally {
    downloading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('calendar.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('calendar.subtitle') }}</p>
      </div>
      <AppButton variant="secondary" icon="download" :loading="downloading" @click="download">
        {{ t('calendar.export') }}
      </AppButton>
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="calendar"
      :title="t('calendar.emptyTitle')"
      :description="t('calendar.emptyDescription')"
    />

    <div v-else class="mt-6 space-y-6">
      <section v-for="day in days" :key="day.key">
        <h2 class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ formatDay(day.date) }}</h2>
        <div class="mt-2 space-y-2">
          <AppCard
            v-for="entry in day.entries"
            :key="entry.id"
            hover
            class="flex cursor-pointer items-center gap-4 p-4"
            @click="open(entry)"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              :class="kindMeta[entry.kind].tone"
            >
              <Icon :name="kindMeta[entry.kind].icon" size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate text-small font-medium text-ink">{{ entry.title }}</p>
                <Badge v-if="entry.status === 'WAITLIST'" variant="warning" size="sm">
                  {{ t('calendar.queued') }}
                </Badge>
                <Badge v-else-if="entry.status === 'MANDATORY'" variant="danger" size="sm">
                  {{ t('common.required') }}
                </Badge>
              </div>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-3 text-caption text-ink-faint">
                <span>{{ formatTime(entry) }}</span>
                <span>· {{ t(`calendar.kind.${entry.kind}`) }}</span>
                <span v-if="entry.location">· {{ entry.location }}</span>
              </p>
            </div>
            <Icon name="chevron-right" size="16" class="shrink-0 text-ink-faint" />
          </AppCard>
        </div>
      </section>
    </div>
  </div>
</template>
