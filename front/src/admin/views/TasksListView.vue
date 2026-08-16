<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
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
const confirm = useConfirm()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const showCreateModal = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const emptyCreateForm = () => ({
  title: '',
  description: '',
  assigneeType: 'USER',
  assignedTo: '',
  position: '',
  priority: 'MEDIUM',
  deadline: '',
})
const createForm = reactive(emptyCreateForm())
const userSearch = ref('')
const userResults = ref([])
const positions = ref([])

const priorityOptions = [
  { value: 'LOW', label: t('tasks.priority.LOW') },
  { value: 'MEDIUM', label: t('tasks.priority.MEDIUM') },
  { value: 'HIGH', label: t('tasks.priority.HIGH') },
]

// One task can go to one person, to everyone holding a position, or to the
// whole company — the last two fan out server-side into a task per person,
// so each recipient keeps their own status.
const audienceOptions = computed(() =>
  ['USER', 'POSITION', 'ALL'].map((value) => ({ value, label: t('tasks.audience.' + value) }))
)
const positionOptions = computed(() => positions.value.map((value) => ({ value, label: value })))

const statusColumns = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

// A position/company-wide task is one document per recipient, but on this
// board it is one card: the admin wrote one task, so they move and track one
// thing. The copies keep their own statuses underneath.
const STATUS_RANK = { TODO: 0, IN_PROGRESS: 1, COMPLETED: 2, CANCELLED: 2 }

// A card sits in the column of its *least advanced* copy — it only moves on
// once every recipient has, which is what makes "all done" readable without
// opening the roster.
function boardStatusOf(counts) {
  const present = statusColumns.filter((status) => counts[status] > 0)
  if (!present.length) return 'TODO'
  const minRank = Math.min(...present.map((status) => STATUS_RANK[status]))
  const candidates = present.filter((status) => STATUS_RANK[status] === minRank)
  // Both terminal states share a rank; a group where anyone finished reads
  // as finished rather than as cancelled.
  return candidates.includes('COMPLETED') ? 'COMPLETED' : candidates[0]
}

const cards = computed(() => {
  const groups = new Map()
  for (const task of items.value) {
    const key = task.batchId ? `batch:${task.batchId}` : `task:${task.id}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(task)
    else groups.set(key, [task])
  }

  return [...groups.entries()].map(([key, tasks]) => {
    const [first] = tasks
    const counts = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 }
    for (const task of tasks) counts[task.status] += 1

    const status = boardStatusOf(counts)
    const overdue = tasks.some((task) => task.effectiveStatus === 'OVERDUE')
    return {
      key,
      id: first.id,
      batchId: first.batchId,
      title: first.title,
      description: first.description,
      priority: first.priority,
      deadline: first.deadline,
      audienceType: first.audienceType,
      audienceValue: first.audienceValue,
      assigneeName: first.assigneeName,
      recipients: [...tasks].sort((a, b) => (a.assigneeName || '').localeCompare(b.assigneeName || '')),
      recipientCount: tasks.length,
      doneCount: counts.COMPLETED,
      counts,
      status,
      effectiveStatus: overdue && ['TODO', 'IN_PROGRESS'].includes(status) ? 'OVERDUE' : status,
    }
  })
})
const priorityVariant = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning' }
const priorityBorder = { LOW: 'border-l-border-strong', MEDIUM: 'border-l-info', HIGH: 'border-l-warning' }

const columns = computed(() =>
  statusColumns.map((status) => ({
    status,
    label: t('tasks.status.' + status),
    items: cards.value.filter((card) => card.status === status),
  }))
)

const draggedCardKey = ref(null)
const dragOverStatus = ref(null)

// Hovering a fan-out card opens its roster — who has it, and where each of
// them stands — without leaving the board.
const hoveredCard = ref(null)
const hoverAnchor = ref({ top: 0, left: 0 })
let hoverTimer = null

function openRoster(card, event) {
  if (!card.batchId) return
  clearTimeout(hoverTimer)
  const rect = event.currentTarget.getBoundingClientRect()
  // Clamped so a card near the right edge or the bottom does not push the
  // panel off screen.
  hoverAnchor.value = {
    top: Math.min(rect.top, Math.max(8, window.innerHeight - 360)),
    left: Math.min(rect.right + 12, Math.max(8, window.innerWidth - 340)),
  }
  hoveredCard.value = card
}

function closeRoster() {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    hoveredCard.value = null
  }, 140)
}

function keepRoster() {
  clearTimeout(hoverTimer)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await tasksApi.listBoard()
    items.value = result.items
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

// Job titles come from the accounts that actually exist, so "by position"
// can only ever be pointed at a value that matches somebody.
async function loadPositions() {
  if (!auth.hasPermission('task:create')) return
  try {
    positions.value = await usersApi.positions()
  } catch {
    positions.value = []
  }
}

// Switching audience clears whatever the previous mode had picked, so a
// stale user id can never ride along with a position assignment.
watch(
  () => createForm.assigneeType,
  () => {
    createError.value = ''
    createForm.assignedTo = ''
    createForm.position = ''
    userSearch.value = ''
    userResults.value = []
  }
)

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
  if (createForm.assigneeType === 'USER' && !createForm.assignedTo) {
    createError.value = t('tasks.pickAssignee')
    return
  }
  if (createForm.assigneeType === 'POSITION' && !createForm.position) {
    createError.value = t('tasks.pickPosition')
    return
  }
  createSubmitting.value = true
  createError.value = ''
  try {
    await tasksApi.create({
      title: createForm.title,
      description: createForm.description,
      assigneeType: createForm.assigneeType,
      assignedTo: createForm.assigneeType === 'USER' ? createForm.assignedTo : undefined,
      position: createForm.assigneeType === 'POSITION' ? createForm.position : undefined,
      priority: createForm.priority,
      deadline: createForm.deadline ? new Date(createForm.deadline).toISOString() : null,
    })
    showCreateModal.value = false
    Object.assign(createForm, emptyCreateForm())
    userSearch.value = ''
    userResults.value = []
    await load()
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

function onDragStart(card) {
  draggedCardKey.value = card.key
}

function onDragEnd() {
  draggedCardKey.value = null
  dragOverStatus.value = null
}

function onDragEnterColumn(status) {
  dragOverStatus.value = status
}

async function onDrop(status) {
  const key = draggedCardKey.value
  dragOverStatus.value = null
  draggedCardKey.value = null
  const card = cards.value.find((item) => item.key === key)
  if (!card || card.status === status) return

  // A fan-out moves as a whole, but only the copies in the column it was
  // dragged out of: a card in "To do" stands for the people who had not
  // started, and must not drag the finished ones backwards.
  try {
    if (card.batchId) {
      await tasksApi.updateBatch(card.batchId, { status, fromStatus: card.status })
    } else {
      await tasksApi.update(card.id, { status })
    }
    await load()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

// One click on a fan-out card would otherwise wipe the task off dozens of
// people at once, with nothing to undo it. A single-assignee card keeps the
// old immediate delete — there is nothing hidden about what it removes.
const pendingDelete = ref(null)

function requestDelete(card) {
  if (card.batchId) pendingDelete.value = card
  else deleteTask(card)
}

async function confirmDelete() {
  const card = pendingDelete.value
  pendingDelete.value = null
  if (card) await deleteTask(card)
}

// Deleting is the one batch action that is NOT scoped to the card's column.
// There is a single card per fan-out, so scoping the delete would strip the
// copies in one status and leave the card sitting in the next one — the
// admin would click delete and watch the task move instead of disappear.
async function deleteTask(card) {
  // A fan-out card stands for many people's copies, so the prompt says how
  // many are about to disappear.
  const message = card.batchId
    ? t('confirm.deleteTaskBatch', { count: card.recipientCount })
    : t('confirm.deleteTask')
  if (!(await confirm.ask({ message }))) return

  try {
    if (card.batchId) await tasksApi.removeBatch(card.batchId)
    else await tasksApi.remove(card.id)
    await load()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

function deadlineLabel(date) {
  return new Date(date).toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
}

onMounted(() => {
  load()
  loadPositions()
})
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
            :key="task.key"
            padding="sm"
            draggable="true"
            class="group cursor-grab border-l-4 active:cursor-grabbing"
            :class="[priorityBorder[task.priority], draggedCardKey === task.key ? 'opacity-40' : '']"
            @dragstart="onDragStart(task)"
            @dragend="onDragEnd"
            @mouseenter="openRoster(task, $event)"
            @mouseleave="closeRoster"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="text-small font-medium text-ink" :class="task.status === 'COMPLETED' ? 'text-ink-faint line-through' : ''">{{ task.title }}</p>
              <button
                type="button"
                class="shrink-0 rounded p-1 text-ink-faint opacity-0 transition-default hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
                @click="requestDelete(task)"
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

            <!-- One card stands for the whole fan-out: its audience, how many
                 people carry it, and how many are done. -->
            <div v-if="task.batchId" class="mt-3 border-t border-border pt-2.5">
              <div class="flex items-center gap-1.5">
                <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                  <Icon name="users" size="11" />
                </span>
                <span class="min-w-0 flex-1 truncate text-caption text-ink-faint">
                  {{ task.audienceType === 'POSITION' ? task.audienceValue : t('tasks.audience.ALL') }}
                </span>
                <span class="shrink-0 text-caption font-medium text-ink-muted">
                  {{ task.doneCount }}/{{ task.recipientCount }}
                </span>
              </div>
              <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  class="h-full rounded-full bg-primary transition-default"
                  :style="{ width: `${Math.round((task.doneCount / task.recipientCount) * 100)}%` }"
                />
              </div>
            </div>

            <div v-else-if="task.assigneeName" class="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5">
              <Avatar :name="task.assigneeName" size="xs" />
              <span class="truncate text-caption text-ink-faint">{{ task.assigneeName }}</span>
            </div>
          </AppCard>

          <p v-if="col.items.length === 0" class="rounded-lg border border-dashed border-border py-8 text-center text-caption text-ink-faint">—</p>
        </div>
      </div>
    </div>

    <EmptyState v-else icon="check-square" :title="t('admin.tasks.empty')" class="mt-6" />

    <!-- The roster behind a fan-out card, on hover. It is read-only: the
         board moves the whole group, and one person's copy is changed by that
         person. -->
    <Teleport to="body">
      <div
        v-if="hoveredCard"
        class="fixed z-50 w-80 rounded-xl border border-border bg-surface p-3 shadow-lg"
        :style="{ top: `${hoverAnchor.top}px`, left: `${hoverAnchor.left}px` }"
        @mouseenter="keepRoster"
        @mouseleave="closeRoster"
      >
        <div class="flex items-center gap-2">
          <p class="min-w-0 flex-1 truncate text-small font-semibold text-ink">{{ hoveredCard.title }}</p>
          <span class="shrink-0 text-caption text-ink-faint">
            {{ hoveredCard.doneCount }}/{{ hoveredCard.recipientCount }}
          </span>
        </div>
        <p class="mt-0.5 truncate text-caption text-ink-faint">
          {{ hoveredCard.audienceType === 'POSITION' ? hoveredCard.audienceValue : t('tasks.audience.ALL') }}
        </p>

        <div class="mt-2.5 max-h-72 space-y-0.5 overflow-y-auto border-t border-border pt-2">
          <div
            v-for="recipient in hoveredCard.recipients"
            :key="recipient.id"
            class="flex items-center gap-2 rounded-md px-1 py-1"
          >
            <Avatar :name="recipient.assigneeName || '?'" size="xs" />
            <span class="min-w-0 flex-1 truncate text-caption text-ink">{{ recipient.assigneeName || '—' }}</span>
            <Badge
              :variant="
                recipient.effectiveStatus === 'OVERDUE'
                  ? 'danger'
                  : recipient.status === 'COMPLETED'
                    ? 'success'
                    : recipient.status === 'IN_PROGRESS'
                      ? 'info'
                      : 'neutral'
              "
              size="sm"
            >
              {{ t('tasks.status.' + recipient.effectiveStatus) }}
            </Badge>
          </div>
        </div>
      </div>
    </Teleport>

    <Modal
      :model-value="Boolean(pendingDelete)"
      :title="t('tasks.batchDeleteTitle')"
      @update:model-value="pendingDelete = null"
    >
      <p class="text-body text-ink-muted">
        {{ t('tasks.batchDeleteBody', { count: pendingDelete?.recipientCount ?? 0 }) }}
      </p>
      <p class="mt-2 text-small font-medium text-ink">{{ pendingDelete?.title }}</p>
      <div class="flex justify-end gap-2 pt-4">
        <AppButton type="button" variant="ghost" @click="pendingDelete = null">{{ t('courses.cancel') }}</AppButton>
        <AppButton type="button" variant="danger" @click="confirmDelete">{{ t('tasks.confirmDelete') }}</AppButton>
      </div>
    </Modal>

    <Modal v-model="showCreateModal" :title="t('tasks.newTask')" size="lg">
      <form class="space-y-4" @submit.prevent="onCreateSubmit">
        <AppInput v-model="createForm.title" required :label="t('admin.courses.fields.title')" />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.description') }}</label>
          <textarea v-model="createForm.description" rows="3" class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </div>
        <AppSelect v-model="createForm.assigneeType" :label="t('tasks.audienceLabel')" :options="audienceOptions" />

        <div v-if="createForm.assigneeType === 'USER'" class="relative">
          <AppInput v-model="userSearch" icon="search" :label="t('tasks.assignee')" @input="onUserSearch" />
          <ul v-if="userResults.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface text-small shadow-md">
            <li v-for="user in userResults" :key="user.id" class="cursor-pointer px-3 py-2 transition-default hover:bg-surface-2" @click="pickAssignee(user)">
              {{ user.fullName }} <span class="text-ink-faint">({{ user.jshshir }})</span>
            </li>
          </ul>
        </div>

        <div v-else-if="createForm.assigneeType === 'POSITION'">
          <AppSelect
            v-model="createForm.position"
            :label="t('tasks.positionLabel')"
            :placeholder="t('tasks.positionPlaceholder')"
            :options="positionOptions"
          />
          <p class="mt-1.5 text-caption text-ink-faint">
            {{ positionOptions.length ? t('tasks.positionHint') : t('tasks.positionsEmpty') }}
          </p>
        </div>

        <p v-else class="rounded-md bg-surface-2 px-3.5 py-2.5 text-caption text-ink-muted">{{ t('tasks.allHint') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
