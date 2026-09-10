<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { tasksApi } from '@/services/tasks'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, locale } = useI18n()
const toast = useToast()
const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const priorityVariant = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning' }

const columns = computed(() => [
  { status: 'TODO', label: t('tasks.status.TODO'), items: items.value.filter((tsk) => tsk.status === 'TODO') },
  { status: 'IN_PROGRESS', label: t('tasks.status.IN_PROGRESS'), items: items.value.filter((tsk) => tsk.status === 'IN_PROGRESS') },
  { status: 'COMPLETED', label: t('tasks.status.COMPLETED'), items: items.value.filter((tsk) => tsk.status === 'COMPLETED') },
])

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await tasksApi.listMy({})
    items.value = result.items
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function setStatus(task, status) {
  try {
    const updated = await tasksApi.update(task.id, { status })
    items.value = items.value.map((tsk) => (tsk.id === task.id ? updated : tsk))
  } catch (error) {
    // The row is not moved on failure: showing the new status while the
    // server still holds the old one is worse than not moving at all.
    toast.error(apiErrorText(error, t('tasks.updateFailed')))
  }
}

function deadlineLabel(date) {
  return new Date(date).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')]"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ t('tasks.title') }}</h1>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-64 w-full" />
    </div>

    <template v-else-if="items.length">
      <div class="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div v-for="col in columns" :key="col.status">
          <div class="mb-3 flex items-center gap-2">
            <h2 class="text-small font-semibold text-ink">{{ col.label }}</h2>
            <span class="rounded-full bg-surface-2 px-2 py-0.5 text-caption font-medium text-ink-faint">{{ col.items.length }}</span>
          </div>

          <div class="space-y-3">
            <AppCard v-for="task in col.items" :key="task.id" class="border shadow-sm" :class="task.effectiveStatus === 'OVERDUE' ? 'border-danger/30' : 'border-border'">
              <div class="flex items-start justify-between gap-2">
                <p class="text-small font-semibold text-ink" :class="task.status === 'COMPLETED' ? 'text-ink-faint line-through' : ''">{{ task.title }}</p>
                <Badge :variant="priorityVariant[task.priority]" size="sm">{{ t('tasks.priority.' + task.priority) }}</Badge>
              </div>
              <p v-if="task.description" class="mt-2 line-clamp-2 text-caption text-ink-muted leading-relaxed">{{ task.description }}</p>

              <div class="mt-4 flex items-center justify-between">
                <span
                  v-if="task.deadline"
                  class="flex items-center gap-1.5 text-caption font-medium"
                  :class="task.effectiveStatus === 'OVERDUE' ? 'text-danger' : 'text-ink-muted'"
                >
                  <Icon name="clock" size="12" />
                  {{ deadlineLabel(task.deadline) }}
                </span>
                <span v-else />

                <div v-if="task.status !== 'COMPLETED' && task.status !== 'CANCELLED'" class="flex gap-1.5">
                  <AppButton v-if="task.status === 'TODO'" variant="ghost" size="sm" @click="setStatus(task, 'IN_PROGRESS')">{{ t('tasks.start') }}</AppButton>
                  <AppButton variant="secondary" size="sm" icon="check" @click="setStatus(task, 'COMPLETED')">{{ t('tasks.complete') }}</AppButton>
                </div>
              </div>
            </AppCard>

            <p v-if="col.items.length === 0" class="rounded border border-dashed border-border py-8 text-center text-caption text-ink-faint">—</p>
          </div>
        </div>
      </div>
    </template>

    <EmptyState v-else icon="check-square" :title="t('tasks.empty')" class="mt-6" />
    </div>
  </div>
</template>
