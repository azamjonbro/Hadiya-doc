<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { formatSeconds } from '@/utils/format'
import AppSelect from '@/components/ui/AppSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Badge from '@/components/ui/Badge.vue'
import TabError from './TabError.vue'

const props = defineProps({
  userId: { type: String, required: true },
})

const { t, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const data = ref(null)
const days = ref('30')
const hoveredDate = ref(null)

const rangeOptions = computed(() =>
  [7, 30, 90].map((value) => ({ value: String(value), label: t('employee.activity.range', { days: value }) }))
)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await usersApi.activity(props.userId, Number(days.value))
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

// Bars are scaled against the busiest day rather than a fixed ceiling, so a
// light-but-steady month still reads as a shape instead of a flat line.
const peakSeconds = computed(() => Math.max(1, ...(data.value?.days ?? []).map((d) => d.watchedSeconds)))

const hoveredDay = computed(() =>
  (data.value?.days ?? []).find((d) => d.date === hoveredDate.value) ?? null
)

const weekdayPeak = computed(() => Math.max(1, ...(data.value?.weekdays ?? []).map((w) => w.watchedSeconds)))

// Monday-first, matching how the working week is read here — the API
// indexes weekdays 0=Sunday, so the display order is remapped, not the data.
const orderedWeekdays = computed(() => {
  const byWeekday = new Map((data.value?.weekdays ?? []).map((w) => [w.weekday, w]))
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => byWeekday.get(weekday) ?? { weekday, watchedSeconds: 0, sessions: 0, activeDays: 0 })
})

function weekdayName(weekday) {
  // 2024-01-07 was a Sunday, so adding the index lands on the right weekday.
  const date = new Date(Date.UTC(2024, 0, 7 + weekday))
  return date.toLocaleDateString(locale.value, { weekday: 'short', timeZone: 'UTC' })
}

// One class per bar rather than layering conditionals — two background
// utilities on the same element would resolve by stylesheet order, not by
// the order they're listed here.
function barClass(day) {
  if (day.watchedSeconds === 0) return 'bg-border'
  if (day.date === data.value?.bestDay?.date) return 'bg-success'
  return 'bg-primary'
}

function shortDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale.value, {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

watch(days, load)
onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-4">
      <Skeleton class="h-48 w-full" />
      <Skeleton class="h-32 w-full" />
    </div>

    <TabError v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else-if="data">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-h3 text-ink">{{ t('employee.activity.title') }}</h3>
        <div class="w-44"><AppSelect v-model="days" :options="rangeOptions" /></div>
      </div>

      <!-- Daily bars -->
      <div class="mt-4 rounded-lg border border-border bg-surface p-5">
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-small font-semibold text-ink">{{ t('employee.activity.perDay') }}</p>
          <p class="text-caption text-ink-muted">
            <template v-if="hoveredDay">
              {{ shortDate(hoveredDay.date) }} ·
              <strong class="font-semibold text-ink">{{ formatSeconds(hoveredDay.watchedSeconds, t) }}</strong>
              · {{ t('employee.activity.sessions', { count: hoveredDay.sessions }) }}
            </template>
            <template v-else>
              {{ t('employee.activity.total') }}:
              <strong class="font-semibold text-ink">{{ formatSeconds(data.totals.watchedSeconds, t) }}</strong>
            </template>
          </p>
        </div>

        <div class="mt-4 flex h-40 items-end gap-[3px]" @mouseleave="hoveredDate = null">
          <button
            v-for="day in data.days"
            :key="day.date"
            type="button"
            class="group relative flex h-full min-w-0 flex-1 items-end rounded-sm transition-default hover:bg-surface-2"
            :aria-label="`${day.date}: ${formatSeconds(day.watchedSeconds, t)}`"
            @mouseenter="hoveredDate = day.date"
            @focus="hoveredDate = day.date"
          >
            <span
              class="w-full rounded-sm transition-default"
              :class="[barClass(day), hoveredDate === day.date ? 'opacity-100' : 'opacity-90']"
              :style="{ height: day.watchedSeconds ? `${Math.max(4, (day.watchedSeconds / peakSeconds) * 100)}%` : '2px' }"
            />
          </button>
        </div>
        <div class="mt-2 flex justify-between text-caption text-ink-faint">
          <span>{{ shortDate(data.from) }}</span>
          <span>{{ shortDate(data.days[data.days.length - 1].date) }}</span>
        </div>
      </div>

      <!-- Best / quietest -->
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-border bg-surface p-4">
          <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.activity.bestDay') }}</p>
          <p class="mt-1 text-h3 text-ink">{{ data.bestDay ? shortDate(data.bestDay.date) : '—' }}</p>
          <p v-if="data.bestDay" class="mt-0.5 text-small text-ink-muted">{{ formatSeconds(data.bestDay.watchedSeconds, t) }}</p>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.activity.quietestDay') }}</p>
          <p class="mt-1 text-h3 text-ink">{{ data.quietestDay ? shortDate(data.quietestDay.date) : '—' }}</p>
          <p v-if="data.quietestDay" class="mt-0.5 text-small text-ink-muted">{{ formatSeconds(data.quietestDay.watchedSeconds, t) }}</p>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.activity.activeDays') }}</p>
          <p class="mt-1 text-h3 text-ink">{{ data.totals.activeDays }}<span class="text-small font-normal text-ink-muted">/{{ data.rangeDays }}</span></p>
          <p class="mt-0.5 text-small text-ink-muted">{{ t('employee.activity.sessions', { count: data.totals.sessions }) }}</p>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.activity.perActiveDay') }}</p>
          <p class="mt-1 text-h3 text-ink">{{ formatSeconds(data.totals.averageSecondsPerActiveDay, t) }}</p>
        </div>
      </div>

      <!-- Weekday habits -->
      <div class="mt-4 rounded-lg border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-small font-semibold text-ink">{{ t('employee.activity.byWeekday') }}</p>
          <div v-if="data.busiestWeekday" class="flex flex-wrap items-center gap-2">
            <Badge variant="success" size="sm">
              {{ t('employee.activity.busiest') }}: {{ weekdayName(data.busiestWeekday.weekday) }}
            </Badge>
            <Badge v-if="data.quietestWeekday" variant="warning" size="sm">
              {{ t('employee.activity.quietest') }}: {{ weekdayName(data.quietestWeekday.weekday) }}
            </Badge>
          </div>
        </div>

        <ul class="mt-4 space-y-2.5">
          <li v-for="weekday in orderedWeekdays" :key="weekday.weekday" class="flex items-center gap-3">
            <span class="w-10 shrink-0 text-caption font-medium capitalize text-ink-muted">{{ weekdayName(weekday.weekday) }}</span>
            <div class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                class="h-full rounded-full transition-[width] duration-500"
                :class="weekday.weekday === data.busiestWeekday?.weekday ? 'bg-success' : 'bg-primary'"
                :style="{ width: `${(weekday.watchedSeconds / weekdayPeak) * 100}%` }"
              />
            </div>
            <span class="w-28 shrink-0 text-right text-caption text-ink-muted">{{ formatSeconds(weekday.watchedSeconds, t) }}</span>
          </li>
        </ul>
      </div>

      <EmptyState
        v-if="!data.totals.activeDays"
        icon="activity"
        :title="t('employee.activity.empty')"
        :description="t('employee.activity.emptyHint')"
      />
    </template>
  </div>
</template>
