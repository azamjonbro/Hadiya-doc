<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { gamificationApi } from '@/services/gamification'
import { BADGE_ICONS } from '@/gamification/badgeIcons'
import AppCard from '@/components/ui/AppCard.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const summary = ref(null)
const rows = ref([])

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    ;[summary.value, rows.value] = await Promise.all([gamificationApi.getMySummary(), gamificationApi.getLeaderboard()])
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('nav.leaderboard') }}</h1>

    <Skeleton v-if="loading" class="mt-5 h-40 w-full" />
    <p v-if="errorMessage && !loading" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="summary">
      <AppCard class="mt-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ t('gamification.myPoints') }}</p>
            <p class="mt-1 text-h1 text-ink">{{ summary.totalPoints }}</p>
          </div>
          <div v-if="summary.badges.length" class="flex flex-wrap gap-2">
            <span
              v-for="code in summary.badges"
              :key="code"
              class="flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1.5 text-small font-medium text-primary"
            >
              <Icon :name="BADGE_ICONS[code] ?? 'award'" size="14" />
              {{ t(`gamification.badges.${code}.title`) }}
            </span>
          </div>
          <p v-else class="text-small text-ink-faint">{{ t('gamification.noBadgesYet') }}</p>
        </div>
      </AppCard>

      <AppCard class="mt-6" padding="none">
        <ul class="divide-y divide-border">
          <li
            v-for="(row, index) in rows"
            :key="row.userId"
            class="flex items-center gap-3 px-4 py-3"
            :class="row.userId === auth.user?.id ? 'bg-primary-subtle' : ''"
          >
            <span class="w-6 shrink-0 text-center text-small font-semibold text-ink-faint">{{ index + 1 }}</span>
            <Avatar :name="row.fullName" :src="row.avatar" size="sm" />
            <span class="min-w-0 flex-1 truncate text-small font-medium text-ink">{{ row.fullName }}</span>
            <span class="shrink-0 text-small font-semibold text-ink">{{ row.totalPoints }}</span>
          </li>
        </ul>
        <p v-if="rows.length === 0" class="px-4 py-6 text-center text-small text-ink-faint">{{ t('gamification.empty') }}</p>
      </AppCard>
    </template>
  </div>
</template>
