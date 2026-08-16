<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { gamificationApi } from '@/services/gamification'
import { groupsApi } from '@/services/groups'
import LeaderboardTable from '@/admin/components/groups/LeaderboardTable.vue'
import StatCard from '@/admin/components/dashboard/StatCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const data = ref(null)
const groups = ref([])

const period = ref('all')
const groupId = ref('')
const includeZero = ref('true')

const periodOptions = computed(() =>
  ['all', 'week', 'month', 'quarter'].map((value) => ({ value, label: t(`leaderboard.periods.${value}`) }))
)

const groupOptions = computed(() => [
  { value: '', label: t('leaderboard.allEmployees') },
  ...groups.value.map((group) => ({ value: group.id, label: group.name })),
])

const zeroOptions = computed(() => [
  { value: 'true', label: t('leaderboard.showEveryone') },
  { value: 'false', label: t('leaderboard.onlyScorers') },
])

const podium = computed(() => (data.value?.rows ?? []).slice(0, 3))
const totalPoints = computed(() => (data.value?.rows ?? []).reduce((sum, row) => sum + row.totalPoints, 0))
const scorers = computed(() => (data.value?.rows ?? []).filter((row) => row.totalPoints > 0).length)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await gamificationApi.leaderboard({
      period: period.value,
      limit: 100,
      includeZero: includeZero.value,
      ...(groupId.value ? { groupId: groupId.value } : {}),
    })
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function loadGroups() {
  try {
    groups.value = await groupsApi.list({})
  } catch {
    groups.value = []
  }
}

// Podium order 2 · 1 · 3, so the winner sits in the middle and tallest.
const PODIUM_ORDER = [1, 0, 2]
const PODIUM_HEIGHTS = ['h-20', 'h-28', 'h-16']

watch([period, groupId, includeZero], load)

onMounted(() => {
  load()
  loadGroups()
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('leaderboard.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('leaderboard.subtitle') }}</p>
      </div>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <div class="w-56"><AppSelect v-model="groupId" :options="groupOptions" /></div>
      <div class="w-44"><AppSelect v-model="period" :options="periodOptions" /></div>
      <div class="w-48"><AppSelect v-model="includeZero" :options="zeroOptions" /></div>
    </div>

    <Skeleton v-if="loading" class="mt-6 h-64 w-full" />
    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="data">
      <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard size="compact" :label="t('leaderboard.ranked')" :value="data.totalRanked" />
        <StatCard size="compact" :label="t('leaderboard.scorers')" :value="scorers" />
        <StatCard size="compact" :label="t('leaderboard.totalPoints')" :value="totalPoints" />
        <StatCard size="compact" :label="t('leaderboard.leader')" :value="podium[0]?.fullName ?? '—'" />
      </div>

      <!-- Podium -->
      <div v-if="podium.length === 3" class="mt-6 flex items-end justify-center gap-3 rounded-lg border border-border bg-surface p-6">
        <div v-for="(slot, index) in PODIUM_ORDER" :key="slot" class="flex w-28 flex-col items-center sm:w-36">
          <Avatar :name="podium[slot].fullName" :src="podium[slot].avatar" :size="index === 1 ? 'lg' : 'md'" />
          <p class="mt-2 w-full truncate text-center text-small font-medium text-ink">{{ podium[slot].fullName }}</p>
          <p class="text-caption text-ink-faint">{{ podium[slot].totalPoints }} {{ t('leaderboard.pointsShort') }}</p>
          <div
            class="mt-2 flex w-full items-start justify-center rounded-t-md pt-2"
            :class="[PODIUM_HEIGHTS[index], index === 1 ? 'bg-warning-subtle' : 'bg-surface-2']"
          >
            <Icon v-if="index === 1" name="award" size="18" class="text-warning" />
            <span v-else class="text-h3 text-ink-faint">{{ podium[slot].rank }}</span>
          </div>
        </div>
      </div>

      <LeaderboardTable class="mt-6" :rows="data.rows" :show-department="!groupId" />

      <p v-if="groupId" class="mt-3 text-caption text-ink-faint">
        <button type="button" class="underline transition-default hover:text-ink" @click="router.push(`/admin/groups/${groupId}`)">
          {{ t('leaderboard.openGroup') }}
        </button>
      </p>
    </template>
  </div>
</template>
