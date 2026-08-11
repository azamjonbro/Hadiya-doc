<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { tasksApi } from '@/services/tasks'
import { usersApi } from '@/services/users'

const { t } = useI18n()
const auth = useAuthStore()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const showCreateForm = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({ title: '', description: '', assignedTo: '', priority: 'MEDIUM', deadline: '' })
const userSearch = ref('')
const userResults = ref([])

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
    showCreateForm.value = false
    Object.assign(createForm, { title: '', description: '', assignedTo: '', priority: 'MEDIUM', deadline: '' })
    userSearch.value = ''
    await load()
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
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
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('tasks.title') }}</h1>
      <button
        v-if="auth.hasPermission('task:create')"
        type="button"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
        @click="showCreateForm = !showCreateForm"
      >
        {{ showCreateForm ? t('courses.cancel') : t('tasks.newTask') }}
      </button>
    </div>

    <form
      v-if="showCreateForm"
      class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      @submit.prevent="onCreateSubmit"
    >
      <input v-model="createForm.title" required :placeholder="t('courses.fields.title')" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <textarea v-model="createForm.description" :placeholder="t('courses.fields.description')" rows="3" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"></textarea>
      <div class="relative col-span-2">
        <input v-model="userSearch" :placeholder="t('tasks.assignee')" class="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" @input="onUserSearch" />
        <ul v-if="userResults.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-slate-300 bg-white text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <li v-for="user in userResults" :key="user.id" class="cursor-pointer px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800" @click="pickAssignee(user)">
            {{ user.fullName }} ({{ user.username }})
          </li>
        </ul>
      </div>
      <select v-model="createForm.priority" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
        <option value="LOW">LOW</option>
        <option value="MEDIUM">MEDIUM</option>
        <option value="HIGH">HIGH</option>
      </select>
      <input v-model="createForm.deadline" type="date" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />

      <p v-if="createError" class="col-span-2 text-sm text-red-500">{{ createError }}</p>

      <button type="submit" :disabled="createSubmitting" class="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
        {{ createSubmitting ? t('courses.creating') : t('courses.create') }}
      </button>
    </form>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>
    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <ul class="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      <li v-for="task in items" :key="task.id" class="flex items-center justify-between p-4">
        <div>
          <p class="font-medium">{{ task.title }}</p>
          <p class="text-sm text-slate-500 dark:text-slate-400">{{ task.priority }}</p>
        </div>
        <span class="text-sm font-medium" :class="badgeClass(task)">{{ task.effectiveStatus }}</span>
      </li>
      <li v-if="!loading && items.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('tasks.empty') }}
      </li>
    </ul>
  </div>
</template>
