<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { gamificationApi } from '@/services/gamification'
import LeaderboardTable from './LeaderboardTable.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const props = defineProps({
  groupId: { type: String, required: true },
})

const { t } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const data = ref(null)
const period = ref('all')

const periodOptions = computed(() =>
  ['all', 'week', 'month', 'quarter'].map((value) => ({ value, label: t(`leaderboard.periods.${value}`) }))
)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await gamificationApi.leaderboard({
      groupId: props.groupId,
      period: period.value,
      limit: 100,
      // A group board is a management view, so people on zero belong on it —
      // that's exactly who a manager is looking for.
      includeZero: 'true',
    })
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

watch(period, load)
onMounted(load)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-h3 text-ink">{{ t('groups.tabs.leaderboard') }}</h2>
      <div class="w-44"><AppSelect v-model="period" :options="periodOptions" /></div>
    </div>

    <Skeleton v-if="loading" class="mt-4 h-48 w-full" />
    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>
    <LeaderboardTable v-else-if="data" class="mt-4" :rows="data.rows" :show-department="false" />
  </div>
</template>
