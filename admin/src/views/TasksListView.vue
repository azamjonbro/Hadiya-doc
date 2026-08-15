<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { tasksApi } from '@/services/tasks'
import { usersApi } from '@/services/users'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Modal from '@/components/ui/Modal.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const { t, locale } = useI18n()
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

const statusColumns = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
const priorityVariant = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning' }
const priorityBorder = { LOW: 'border-l-border-strong', MEDIUM: 'border-l-info', HIGH: 'border-l-warning' }

const columns = computed(() =>
  statusColumns.map((status) => ({
    status,
    label: t('tasks.status.' + status),
    items: items.value.filter((task) => task.status === status),
  }))
)

const draggedTaskId = ref(null)
const dragOverStatus = ref(null)

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

function onDragStart(task) {
  draggedTaskId.value = task.id
}

function onDragEnd() {
  draggedTaskId.value = null
  dragOverStatus.value = null
}

function onDragEnterColumn(status) {
  dragOverStatus.value = status
}

async function onDrop(status) {
  const taskId = draggedTaskId.value
  dragOverStatus.value = null
  draggedTaskId.value = null
  const task = items.value.find((tsk) => tsk.id === taskId)
  if (!task || task.status === status) return

  const previousStatus = task.status
  task.status = status // optimistic
  try {
    const updated = await tasksApi.update(taskId, { status })
    // The update response isn't hydrated with assigneeName (only list endpoints are), so keep the row's existing name instead of overwriting it with the blank one update returns.
    items.value = items.value.map((tsk) => (tsk.id === taskId ? { ...tsk, ...updated, assigneeName: tsk.assigneeName } : tsk))
  } catch (error) {
    task.status = previousStatus
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

async function deleteTask(task) {
  try {
    await tasksApi.remove(task.id)
    items.value = items.value.filter((tsk) => tsk.id !== task.id)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

function deadlineLabel(date) {
  return new Date(date).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-[1400px] px-6 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-h1 text-ink">{{ t('tasks.title') }}</h1>
      <AppButton v-if="auth.hasPermission('task:create')" icon="plus" @click="showCreateModal = true">{{ t('tasks.newTask') }}</AppButton>
    </div>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div v-if="loading" class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
      <Skeleton v-for="i in 4" :key="i" class="h-72 w-full" />
    </div>

    <div v-else-if="items.length" class="mt-6 flex gap-4 overflow-x-auto pb-2">
      <div
        v-for="col in columns"
        :key="col.status"
        class="w-72 shrink-0 rounded-lg"
        :class="dragOverStatus === col.status ? 'bg-primary-subtle/40' : ''"
        @dragover.prevent="onDragEnterColumn(col.status)"
        @dragleave="dragOverStatus === col.status && (dragOverStatus = null)"
        @drop.prevent="onDrop(col.status)"
      >
        <div class="mb-3 flex items-center gap-2 px-1">
          <h2 class="text-small font-semibold text-ink">{{ col.label }}</h2>
          <span class="rounded-full bg-surface-2 px-2 py-0.5 text-caption font-medium text-ink-faint">{{ col.items.length }}</span>
        </div>

        <div class="min-h-[80px] space-y-2.5">
          <AppCard
            v-for="task in col.items"
            :key="task.id"
            padding="sm"
            draggable="true"
            class="group cursor-grab border-l-4 active:cursor-grabbing"
            :class="[priorityBorder[task.priority], draggedTaskId === task.id ? 'opacity-40' : '']"
            @dragstart="onDragStart(task)"
            @dragend="onDragEnd"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="text-small font-medium text-ink" :class="task.status === 'COMPLETED' ? 'text-ink-faint line-through' : ''">{{ task.title }}</p>
              <button
                type="button"
                class="shrink-0 rounded p-1 text-ink-faint opacity-0 transition-default hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
                @click="deleteTask(task)"
              >
                <Icon name="trash" size="14" />
              </button>
            </div>
            <p v-if="task.description" class="mt-1 line-clamp-2 text-caption text-ink-muted">{{ task.description }}</p>

            <div class="mt-3 flex items-center justify-between gap-2">
              <Badge :variant="priorityVariant[task.priority]" size="sm">{{ t('tasks.priority.' + task.priority) }}</Badge>
              <span
                v-if="task.deadline"
                class="flex items-center gap-1 text-caption"
                :class="task.effectiveStatus === 'OVERDUE' ? 'font-medium text-danger' : 'text-ink-faint'"
              >
                <Icon name="clock" size="12" />
                {{ deadlineLabel(task.deadline) }}
              </span>
            </div>

            <div v-if="task.assigneeName" class="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5">
              <Avatar :name="task.assigneeName" size="xs" />
              <span class="truncate text-caption text-ink-faint">{{ task.assigneeName }}</span>
            </div>
          </AppCard>

          <p v-if="col.items.length === 0" class="rounded-lg border border-dashed border-border py-8 text-center text-caption text-ink-faint">—</p>
        </div>
      </div>
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
          <AppDatePicker v-model="createForm.deadline" :label="t('tasks.deadline')" />
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
