<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { formatSeconds } from '@/utils/format'
import LevelGauge from './LevelGauge.vue'
import StatCard from '@/components/dashboard/StatCard.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TabError from './TabError.vue'

const props = defineProps({
  userId: { type: String, required: true },
})

const { t } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const performance = ref(null)
const activity = ref(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [performanceResult, activityResult] = await Promise.all([
      usersApi.performance(props.userId),
      usersApi.activity(props.userId, 30),
    ])
    performance.value = performanceResult
    activity.value = activityResult
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

const highlights = computed(() => performance.value?.highlights ?? {})

// "completed / assigned" pairs are rendered as one value so the denominator
// stays visible — 3 completed courses means something very different out of
// 4 than out of 40.
const cards = computed(() => [
  {
    label: t('employee.overview.courses'),
    value: `${highlights.value.coursesCompleted ?? 0}/${highlights.value.coursesAssigned ?? 0}`,
  },
  {
    label: t('employee.overview.videos'),
    value: `${highlights.value.videosCompleted ?? 0}/${highlights.value.videosAssigned ?? 0}`,
  },
  {
    label: t('employee.overview.averageTestScore'),
    value: highlights.value.averageTestScore ?? '—',
    suffix: highlights.value.averageTestScore === null ? '' : '%',
  },
  {
    label: t('employee.overview.hoursLearned'),
    value: highlights.value.hoursLearned ?? 0,
    suffix: t('employee.units.hourShort'),
  },
  {
    label: t('employee.overview.streak'),
    value: highlights.value.streakDays ?? 0,
    suffix: t('employee.units.dayShort'),
  },
  {
    label: t('employee.overview.activeDays'),
    value: `${highlights.value.activeDays ?? 0}/${performance.value?.rangeDays ?? 30}`,
  },
  { label: t('employee.overview.tests'), value: highlights.value.testsTaken ?? 0 },
  {
    label: t('employee.overview.tasks'),
    value: `${highlights.value.tasksCompleted ?? 0}/${highlights.value.tasksTotal ?? 0}`,
  },
])

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="grid gap-5 lg:grid-cols-2">
      <Skeleton class="h-56 w-full" />
      <Skeleton class="h-56 w-full" />
    </div>

    <TabError v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else-if="performance">
      <div class="grid gap-5 lg:grid-cols-2">
        <LevelGauge
          :title="t('employee.overview.learningLevel')"
          :hint="t('employee.overview.learningHint')"
          icon="graduation-cap"
          :result="performance.learning"
        />
        <LevelGauge
          :title="t('employee.overview.effortLevel')"
          :hint="t('employee.overview.effortHint', { days: performance.rangeDays })"
          icon="flame"
          :result="performance.effort"
        />
      </div>

      <div class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          v-for="card in cards"
          :key="card.label"
          size="compact"
          :label="card.label"
          :value="card.value"
          :suffix="card.suffix ?? ''"
        />
      </div>

      <div v-if="activity" class="mt-5 grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-border bg-surface p-4">
          <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.activity.bestDay') }}</p>
          <p v-if="activity.bestDay" class="mt-1 text-h3 text-ink">{{ activity.bestDay.date }}</p>
          <p v-else class="mt-1 text-h3 text-ink-faint">—</p>
          <p v-if="activity.bestDay" class="mt-0.5 text-small text-ink-muted">
            {{ formatSeconds(activity.bestDay.watchedSeconds, t) }}
          </p>
        </div>
        <div class="rounded-lg border border-border bg-surface p-4">
          <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.activity.quietestDay') }}</p>
          <p v-if="activity.quietestDay" class="mt-1 text-h3 text-ink">{{ activity.quietestDay.date }}</p>
          <p v-else class="mt-1 text-h3 text-ink-faint">—</p>
          <p v-if="activity.quietestDay" class="mt-0.5 text-small text-ink-muted">
            {{ formatSeconds(activity.quietestDay.watchedSeconds, t) }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
