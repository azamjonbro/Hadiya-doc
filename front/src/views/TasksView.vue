<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { tasksApi } from '@/services/tasks'

const { t } = useI18n()
const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await tasksApi.listMy({})
    items.value = result.items
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function setStatus(task, status) {
  const updated = await tasksApi.update(task.id, { status })
  items.value = items.value.map((t) => (t.id === task.id ? updated : t))
}

function badgeClass(task) {
  if (task.effectiveStatus === 'OVERDUE') return 'text-red-500'
  if (task.effectiveStatus === 'COMPLETED') return 'text-emerald-500'
  if (task.effectiveStatus === 'IN_PROGRESS') return 'text-amber-500'
  return 'text-slate-500 dark:text-slate-400'
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('tasks.title') }}</h1>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <ul class="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      <li v-for="task in items" :key="task.id" class="p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">{{ task.title }}</p>
            <p v-if="task.description" class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ task.description }}</p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ task.priority }}
              <template v-if="task.deadline"> · {{ t('tasks.deadline') }}: {{ new Date(task.deadline).toLocaleDateString() }}</template>
            </p>
          </div>
          <span class="text-sm font-medium" :class="badgeClass(task)">{{ task.effectiveStatus }}</span>
        </div>
        <div v-if="task.status !== 'COMPLETED' && task.status !== 'CANCELLED'" class="mt-3 flex gap-2">
          <button
            v-if="task.status === 'TODO'"
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
            @click="setStatus(task, 'IN_PROGRESS')"
          >
            {{ t('tasks.start') }}
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1 text-xs dark:border-slate-700"
            @click="setStatus(task, 'COMPLETED')"
          >
            {{ t('tasks.complete') }}
          </button>
        </div>
      </li>
      <li v-if="!loading && items.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('tasks.empty') }}
      </li>
    </ul>
  </div>
</template>
