<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { dashboardApi } from '@/services/dashboard'
import { formatDate as formatDateValue } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import DashboardScopeSwitch from '@/admin/components/dashboard/DashboardScopeSwitch.vue'

const { t, locale } = useI18n()
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const failed = ref(false)

async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await dashboardApi.team()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

const cards = computed(() => {
  const c = data.value?.cards
  if (!c) return []
  return [
    { key: 'teamSize', value: c.teamSize },
    { key: 'completionRate', value: `${c.completionRate}%` },
    // Overdue is the one figure on this page somebody has to act on, so it
    // is the only one that changes colour.
    { key: 'overdue', value: c.overdue, alert: c.overdue > 0 },
    { key: 'activeLast30Days', value: c.activeLast30Days },
    { key: 'openTasks', value: c.openTasks },
  ]
})

const members = computed(() => data.value?.members ?? [])
const needsAttention = computed(() => data.value?.needsAttention ?? [])
const deadlines = computed(() => data.value?.upcomingDeadlines ?? [])

function openMember(id) {
  router.push({ name: 'admin-user-detail', params: { id } })
}

function formatDate(value) {
  return value ? formatDateValue(value, locale.value) : ''
}

// "Never" is a different fact from "a long time ago", and a manager needs to
// tell them apart — so the two render differently rather than both as a date.
function lastActivity(member) {
  return member.lastActivityAt ? formatDate(member.lastActivityAt) : t('team.never')
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('team.title') }}</h1>
        <p class="mt-1 max-w-2xl text-small text-ink-muted">{{ t('team.hint') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <!-- The other half of the switch (8.5): whichever dashboard you are
             on, the other one is one click away. -->
        <DashboardScopeSwitch />
        <AppButton v-if="!loading" size="sm" variant="ghost" icon="refresh-cw" @click="load">
          {{ t('common.refresh') }}
        </AppButton>
      </div>
    </div>

    <Skeleton v-if="loading" class="mt-6 h-72 w-full" />

    <div
      v-else-if="failed"
      class="mt-6 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3"
    >
      <span class="text-small text-ink-muted">{{ t('team.loadFailed') }}</span>
      <AppButton size="sm" variant="ghost" @click="load">{{ t('common.retry') }}</AppButton>
    </div>

    <!-- A manager with nobody under them is a real, recoverable state during
         an org import — say so rather than showing five zeroes. -->
    <EmptyState
      v-else-if="!data.cards.teamSize"
      class="mt-10"
      icon="users"
      :title="t('team.emptyTitle')"
      :description="t('team.emptyHint')"
    />

    <template v-else>
      <div class="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AppCard v-for="card in cards" :key="card.key" class="py-4">
          <div
            class="font-mono text-h2 tabular-nums"
            :class="card.alert ? 'text-danger' : 'text-ink'"
          >
            {{ card.value }}
          </div>
          <div class="mt-1 text-caption text-ink-muted">{{ t(`team.cards.${card.key}`) }}</div>
        </AppCard>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <AppCard class="lg:col-span-2">
          <div class="flex items-center justify-between">
            <h2 class="text-small font-semibold text-ink">{{ t('team.progress') }}</h2>
            <span class="text-caption text-ink-faint">{{ t('team.progressHint') }}</span>
          </div>

          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[32rem] border-collapse text-small">
              <thead>
                <tr class="border-b border-border text-caption text-ink-muted">
                  <th class="py-2 pr-3 text-left font-medium">{{ t('team.columns.person') }}</th>
                  <th class="w-40 py-2 pr-3 text-left font-medium">{{ t('team.columns.progress') }}</th>
                  <th class="w-20 py-2 pr-3 text-right font-medium">{{ t('team.columns.courses') }}</th>
                  <th class="w-28 py-2 text-right font-medium">{{ t('team.columns.lastSeen') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="member in members"
                  :key="member.id"
                  class="cursor-pointer border-b border-border/60 last:border-0 transition-default hover:bg-surface-2"
                  @click="openMember(member.id)"
                >
                  <td class="py-2 pr-3">
                    <div class="flex items-center gap-2">
                      <Avatar :src="member.avatar" :name="member.fullName" size="sm" />
                      <div class="min-w-0">
                        <div class="truncate text-ink">{{ member.fullName }}</div>
                        <div v-if="member.position" class="truncate text-caption text-ink-faint">
                          {{ member.position }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td class="py-2 pr-3">
                    <ProgressBar :value="member.avgCompletion" />
                    <span class="mt-1 block font-mono text-caption tabular-nums text-ink-muted">
                      {{ member.avgCompletion }}%
                    </span>
                  </td>
                  <td class="py-2 pr-3 text-right font-mono tabular-nums text-ink-muted">
                    {{ member.coursesCompleted }} / {{ member.coursesAssigned }}
                  </td>
                  <td class="py-2 text-right text-caption text-ink-muted">{{ lastActivity(member) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppCard>

        <div class="space-y-6">
          <AppCard>
            <h2 class="text-small font-semibold text-ink">{{ t('team.needsAttention') }}</h2>
            <p v-if="!needsAttention.length" class="mt-3 text-small text-ink-faint">
              {{ t('team.nobodyBehind') }}
            </p>
            <ul v-else class="mt-3 space-y-2">
              <li
                v-for="member in needsAttention"
                :key="member.id"
                class="flex cursor-pointer items-center justify-between gap-2 rounded px-1 py-1 transition-default hover:bg-surface-2"
                @click="openMember(member.id)"
              >
                <span class="truncate text-small text-ink">{{ member.fullName }}</span>
                <Badge variant="warning">{{ member.avgCompletion }}%</Badge>
              </li>
            </ul>
          </AppCard>

          <AppCard>
            <h2 class="text-small font-semibold text-ink">{{ t('team.upcoming') }}</h2>
            <p v-if="!deadlines.length" class="mt-3 text-small text-ink-faint">
              {{ t('team.noDeadlines') }}
            </p>
            <ul v-else class="mt-3 space-y-2.5">
              <li v-for="(row, index) in deadlines" :key="`${row.userId}-${row.courseId}-${index}`">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate text-small text-ink">{{ row.courseTitle }}</div>
                    <div class="truncate text-caption text-ink-faint">{{ row.fullName }}</div>
                  </div>
                  <span class="whitespace-nowrap font-mono text-caption tabular-nums text-ink-muted">
                    <Icon name="calendar" class="mr-1 inline h-3 w-3 align-text-bottom" />
                    {{ formatDate(row.deadline) }}
                  </span>
                </div>
              </li>
            </ul>
          </AppCard>
        </div>
      </div>
    </template>
  </div>
</template>
