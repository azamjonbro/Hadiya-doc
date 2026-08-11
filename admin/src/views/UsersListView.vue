<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'

const { t } = useI18n()
const auth = useAuthStore()

const roleOptions = Object.values(ROLES)

const filters = reactive({ search: '', role: '', department: '', status: '' })
const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')

const showCreateForm = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const createForm = reactive({
  fullName: '',
  username: '',
  email: '',
  phone: '',
  roleName: ROLES.EMPLOYEE,
  department: '',
  position: '',
  password: '',
  isActive: true,
})

function buildParams(cursor) {
  const params = {}
  if (filters.search) params.search = filters.search
  if (filters.role) params.role = filters.role
  if (filters.department) params.department = filters.department
  if (filters.status) params.status = filters.status
  if (cursor) params.cursor = cursor
  return params
}

async function loadFirstPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await usersApi.list(buildParams())
    items.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value) return
  loading.value = true
  try {
    const result = await usersApi.list(buildParams(nextCursor.value))
    items.value = [...items.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function onCreateSubmit() {
  createSubmitting.value = true
  createError.value = ''
  try {
    await usersApi.create({ ...createForm })
    showCreateForm.value = false
    Object.assign(createForm, {
      fullName: '',
      username: '',
      email: '',
      phone: '',
      roleName: ROLES.EMPLOYEE,
      department: '',
      position: '',
      password: '',
      isActive: true,
    })
    await loadFirstPage()
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

onMounted(loadFirstPage)
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-12">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('users.title') }}</h1>
      <button
        v-if="auth.hasPermission('user:create')"
        type="button"
        class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
        @click="showCreateForm = !showCreateForm"
      >
        {{ showCreateForm ? t('users.cancel') : t('users.newUser') }}
      </button>
    </div>

    <form
      v-if="showCreateForm"
      class="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
      @submit.prevent="onCreateSubmit"
    >
      <input v-model="createForm.fullName" required :placeholder="t('users.fields.fullName')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <input v-model="createForm.username" required :placeholder="t('users.fields.username')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <input v-model="createForm.email" type="email" required :placeholder="t('users.fields.email')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <input v-model="createForm.phone" :placeholder="t('users.fields.phone')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <select v-model="createForm.roleName" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
        <option v-for="role in roleOptions" :key="role" :value="role">{{ role }}</option>
      </select>
      <input v-model="createForm.department" :placeholder="t('users.fields.department')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <input v-model="createForm.position" :placeholder="t('users.fields.position')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
      <input v-model="createForm.password" type="password" required :placeholder="t('users.fields.password')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />

      <p v-if="createError" class="col-span-2 text-sm text-red-500">{{ createError }}</p>

      <button
        type="submit"
        :disabled="createSubmitting"
        class="col-span-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {{ createSubmitting ? t('users.creating') : t('users.create') }}
      </button>
    </form>

    <div class="mt-6 flex flex-wrap gap-2">
      <input v-model="filters.search" :placeholder="t('users.filters.search')" class="rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700" @keyup.enter="loadFirstPage" />
      <select v-model="filters.role" class="rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700" @change="loadFirstPage">
        <option value="">{{ t('users.filters.allRoles') }}</option>
        <option v-for="role in roleOptions" :key="role" :value="role">{{ role }}</option>
      </select>
      <input v-model="filters.department" :placeholder="t('users.filters.department')" class="rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700" @keyup.enter="loadFirstPage" />
      <select v-model="filters.status" class="rounded-md border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700" @change="loadFirstPage">
        <option value="">{{ t('users.filters.allStatuses') }}</option>
        <option value="active">{{ t('users.filters.active') }}</option>
        <option value="inactive">{{ t('users.filters.inactive') }}</option>
      </select>
      <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" @click="loadFirstPage">
        {{ t('users.filters.apply') }}
      </button>
    </div>

    <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <tr>
            <th class="px-4 py-2 font-medium">{{ t('users.fields.fullName') }}</th>
            <th class="px-4 py-2 font-medium">{{ t('users.fields.username') }}</th>
            <th class="px-4 py-2 font-medium">{{ t('users.fields.department') }}</th>
            <th class="px-4 py-2 font-medium">{{ t('users.role') }}</th>
            <th class="px-4 py-2 font-medium">{{ t('users.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in items"
            :key="user.id"
            class="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900"
            @click="$router.push(`/admin/users/${user.id}`)"
          >
            <td class="px-4 py-2">{{ user.fullName }}</td>
            <td class="px-4 py-2 text-slate-500 dark:text-slate-400">{{ user.username }}</td>
            <td class="px-4 py-2">{{ user.department || '—' }}</td>
            <td class="px-4 py-2">{{ user.role }}</td>
            <td class="px-4 py-2">
              <span :class="user.isActive ? 'text-emerald-500' : 'text-red-500'">
                {{ user.isActive ? t('users.filters.active') : t('users.filters.inactive') }}
              </span>
            </td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
              {{ t('users.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex justify-center">
      <button
        v-if="nextCursor"
        type="button"
        :disabled="loading"
        class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
        @click="loadMore"
      >
        {{ loading ? t('users.loading') : t('users.loadMore') }}
      </button>
    </div>
  </div>
</template>
