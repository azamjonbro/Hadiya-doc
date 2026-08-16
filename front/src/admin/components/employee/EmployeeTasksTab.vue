<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { formatDate, formatHours } from '@/utils/format'
import StatCard from '@/admin/components/dashboard/StatCard.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Icon from '@/components/ui/Icon.vue'
import TabError from './TabError.vue'

const props = defineProps({
  userId: { type: String, required: true },
})

const { t, locale } = useI18n()

const loading = ref(true)
const errorMessage = ref('')
const data = ref(null)
const statusFilter = ref('')

const statusTone = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  OVERDUE: 'danger',
}

const priorityTone = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'danger' }

const statusOptions = computed(() => [
  { value: '', label: t('common.all') },
  ...['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE'].map((status) => ({
    value: status,
    label: t(`tasks.status.${status}`),
  })),
])

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    data.value = await usersApi.tasks(props.userId)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

const summary = computed(() => data.value?.summary ?? {})

const visibleTasks = computed(() => {
  const items = data.value?.items ?? []
  if (!statusFilter.value) return items
  return items.filter((task) => task.effectiveStatus === statusFilter.value)
})

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-4">
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <TabError v-else-if="errorMessage" :message="errorMessage" @retry="load" />

    <template v-else-if="data">
      <EmptyState
        v-if="!data.items.length"
        icon="briefcase"
        :title="t('employee.tasks.empty')"
        :description="t('employee.tasks.emptyHint')"
      />

      <template v-else>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard size="compact" :label="t('employee.tasks.assigned')" :value="summary.total" />
          <StatCard size="compact" :label="t('employee.tasks.completed')" :value="summary.byStatus.COMPLETED" />
          <StatCard size="compact" :label="t('employee.tasks.onTimeRate')" :value="summary.onTimeRate ?? '—'" suffix="%" />
          <StatCard size="compact" :label="t('employee.tasks.overdue')" :value="summary.overdue" />
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-border bg-surface p-4">
            <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.tasks.averageTime') }}</p>
            <p class="mt-1 text-h3 text-ink">{{ formatHours(summary.averageCompletionHours, t) }}</p>
          </div>
          <div class="rounded-lg border border-border bg-surface p-4">
            <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.tasks.fastest') }}</p>
            <p class="mt-1 truncate text-small font-medium text-ink">{{ summary.fastest?.title ?? '—' }}</p>
            <p v-if="summary.fastest" class="mt-0.5 text-caption text-success">{{ formatHours(summary.fastest.completionHours, t) }}</p>
          </div>
          <div class="rounded-lg border border-border bg-surface p-4">
            <p class="text-caption font-medium uppercase tracking-wide text-ink-faint">{{ t('employee.tasks.slowest') }}</p>
            <p class="mt-1 truncate text-small font-medium text-ink">{{ summary.slowest?.title ?? '—' }}</p>
            <p v-if="summary.slowest" class="mt-0.5 text-caption text-warning">{{ formatHours(summary.slowest.completionHours, t) }}</p>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-h3 text-ink">{{ t('employee.tasks.history') }}</h3>
          <div class="w-52"><AppSelect v-model="statusFilter" :options="statusOptions" /></div>
        </div>

        <div class="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
          <table class="w-full min-w-[46rem] text-left">
            <thead>
              <tr class="border-b border-border text-caption uppercase tracking-wide text-ink-faint">
                <th class="px-4 py-2.5 font-medium">{{ t('employee.tasks.task') }}</th>
                <th class="px-4 py-2.5 font-medium">{{ t('employee.tasks.status') }}</th>
                <th class="px-4 py-2.5 font-medium">{{ t('employee.tasks.assignedAt') }}</th>
                <th class="px-4 py-2.5 font-medium">{{ t('tasks.deadline') }}</th>
                <th class="px-4 py-2.5 font-medium">{{ t('employee.tasks.spent') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="task in visibleTasks" :key="task.id" class="transition-default hover:bg-surface-2">
                <td class="px-4 py-3">
                  <p class="text-small font-medium text-ink">{{ task.title }}</p>
                  <p class="mt-0.5 text-caption text-ink-faint">
                    <Badge :variant="priorityTone[task.priority]" size="sm">{{ t(`tasks.priority.${task.priority}`) }}</Badge>
                    <span v-if="task.assignedByName" class="ml-2">{{ t('employee.tasks.by', { name: task.assignedByName }) }}</span>
                  </p>
                </td>
                <td class="px-4 py-3">
                  <Badge :variant="statusTone[task.effectiveStatus]" size="sm">{{ t(`tasks.status.${task.effectiveStatus}`) }}</Badge>
                </td>
                <td class="px-4 py-3 text-caption text-ink-muted">{{ formatDate(task.createdAt, locale) }}</td>
                <td class="px-4 py-3 text-caption text-ink-muted">{{ formatDate(task.deadline, locale) }}</td>
                <td class="px-4 py-3">
                  <div v-if="task.completionHours !== null" class="flex items-center gap-1.5">
                    <Icon
                      v-if="task.onTime !== null"
                      :name="task.onTime ? 'check-circle' : 'alert-circle'"
                      size="13"
                      :class="task.onTime ? 'text-success' : 'text-danger'"
                    />
                    <span class="text-caption text-ink">{{ formatHours(task.completionHours, t) }}</span>
                  </div>
                  <span v-else class="text-caption text-ink-faint">—</span>
                </td>
              </tr>
              <tr v-if="!visibleTasks.length">
                <td colspan="5" class="px-4 py-6 text-center text-small text-ink-faint">{{ t('admin.tasks.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>
