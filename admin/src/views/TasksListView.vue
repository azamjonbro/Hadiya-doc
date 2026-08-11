<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { tasksApi } from '@/services/tasks'
import { usersApi } from '@/services/users'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Modal from '@/components/ui/Modal.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const { t } = useI18n()
const auth = useAuthStore()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const showCreateModal = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({ title: '', description: '', assignedTo: '', priority: 'MEDIUM', deadline: '' })
const userSearch = ref('')
const userResults = ref([])

const priorityOptions = [
  { value: 'LOW', label: t('tasks.priority.LOW') },
  { value: 'MEDIUM', label: t('tasks.priority.MEDIUM') },
  { value: 'HIGH', label: t('tasks.priority.HIGH') },
]

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await tasksApi.listAssignedByMe({})
    items.value = result.items
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function onUserSearch() {
  if (!userSearch.value) {
    userResults.value = []
    return
  }
  const { items: users } = await usersApi.list({ search: userSearch.value, limit: 5 })
  userResults.value = users
}

function pickAssignee(user) {
  createForm.assignedTo = user.id
  userSearch.value = user.fullName
  userResults.value = []
}

async function onCreateSubmit() {
  if (!createForm.assignedTo) {
    createError.value = t('tasks.pickAssignee')
    return
  }
  createSubmitting.value = true
  createError.value = ''
  try {
    await tasksApi.create({
      title: createForm.title,
      description: createForm.description,
      assignedTo: createForm.assignedTo,
      priority: createForm.priority,
      deadline: createForm.deadline ? new Date(createForm.deadline).toISOString() : null,
    })
    showCreateModal.value = false
    Object.assign(createForm, { title: '', description: '', assignedTo: '', priority: 'MEDIUM', deadline: '' })
    userSearch.value = ''
    await load()
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

const statusVariant = { OVERDUE: 'danger', COMPLETED: 'success', IN_PROGRESS: 'info', TODO: 'neutral', CANCELLED: 'neutral' }
const priorityVariant = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning' }

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-h1 text-ink">{{ t('tasks.title') }}</h1>
      <AppButton v-if="auth.hasPermission('task:create')" icon="plus" @click="showCreateModal = true">{{ t('tasks.newTask') }}</AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="i in 4" :key="i" class="h-16 w-full" />
    </div>

    <div v-else-if="items.length" class="mt-6 space-y-3">
      <AppCard v-for="task in items" :key="task.id" class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-small font-medium text-ink">{{ task.title }}</p>
          <p class="mt-1 text-caption text-ink-faint">{{ t('tasks.priority.' + task.priority) }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Badge :variant="priorityVariant[task.priority]" size="sm">{{ t('tasks.priority.' + task.priority) }}</Badge>
          <Badge :variant="statusVariant[task.effectiveStatus] ?? 'neutral'" size="sm">{{ t('tasks.status.' + task.effectiveStatus) }}</Badge>
        </div>
      </AppCard>
    </div>

    <EmptyState v-else icon="check-square" :title="t('tasks.empty')" class="mt-6" />

    <Modal v-model="showCreateModal" :title="t('tasks.newTask')" size="lg">
      <form class="space-y-4" @submit.prevent="onCreateSubmit">
        <AppInput v-model="createForm.title" required :label="t('courses.fields.title')" />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.description') }}</label>
          <textarea v-model="createForm.description" rows="3" class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>
        <div class="relative">
          <AppInput v-model="userSearch" icon="search" :label="t('tasks.assignee')" @input="onUserSearch" />
          <ul v-if="userResults.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface text-small shadow-md">
            <li v-for="user in userResults" :key="user.id" class="cursor-pointer px-3 py-2 transition-default hover:bg-surface-2" @click="pickAssignee(user)">
              {{ user.fullName }} <span class="text-ink-faint">({{ user.username }})</span>
            </li>
          </ul>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <AppSelect v-model="createForm.priority" :label="t('tasks.priorityLabel')" :options="priorityOptions" />
          <AppInput v-model="createForm.deadline" type="date" :label="t('tasks.deadline')" />
        </div>

        <p v-if="createError" class="text-small text-danger">{{ createError }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <AppButton type="button" variant="ghost" @click="showCreateModal = false">{{ t('courses.cancel') }}</AppButton>
          <AppButton type="submit" :loading="createSubmitting">{{ createSubmitting ? t('courses.creating') : t('courses.create') }}</AppButton>
        </div>
      </form>
    </Modal>
  </div>
</template>
