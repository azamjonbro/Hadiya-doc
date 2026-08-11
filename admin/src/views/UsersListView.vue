<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Modal from '@/components/ui/Modal.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const toast = useToast()

const roleOptions = Object.values(ROLES).map((r) => ({ value: r, label: r }))

const filters = reactive({ search: '', role: '', department: '', status: '' })
const items = ref([])
const nextCursor = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const selected = ref(new Set())

const showCreateModal = ref(false)
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

function seededPercent(id, min = 15, max = 97) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return min + (hash % (max - min))
}

const allSelected = computed(() => items.value.length > 0 && selected.value.size === items.value.length)

function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(items.value.map((u) => u.id))
}
function toggleOne(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

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
  selected.value = new Set()
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
    showCreateModal.value = false
    Object.assign(createForm, {
      fullName: '', username: '', email: '', phone: '', roleName: ROLES.EMPLOYEE, department: '', position: '', password: '', isActive: true,
    })
    await loadFirstPage()
    toast.success(t('users.created'))
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    createSubmitting.value = false
  }
}

async function bulkDeactivate() {
  const ids = [...selected.value]
  await Promise.all(ids.map((id) => usersApi.deactivate(id)))
  toast.success(t('users.bulkDeactivated', { count: ids.length }))
  await loadFirstPage()
}

onMounted(loadFirstPage)
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-h1 text-ink">{{ t('users.title') }}</h1>
      <AppButton v-if="auth.hasPermission('user:create')" icon="plus" @click="showCreateModal = true">{{ t('users.newUser') }}</AppButton>
    </div>

    <div class="mt-5 flex flex-wrap items-end gap-3">
      <div class="w-56">
        <AppInput v-model="filters.search" icon="search" :placeholder="t('users.filters.search')" @keyup.enter="loadFirstPage" />
      </div>
      <div class="w-44">
        <AppSelect v-model="filters.role" :placeholder="t('users.filters.allRoles')" :options="roleOptions" @update:model-value="loadFirstPage" />
      </div>
      <div class="w-44">
        <AppInput v-model="filters.department" :placeholder="t('users.filters.department')" @keyup.enter="loadFirstPage" />
      </div>
      <div class="w-40">
        <AppSelect
          v-model="filters.status"
          :placeholder="t('users.filters.allStatuses')"
          :options="[{ value: 'active', label: t('users.filters.active') }, { value: 'inactive', label: t('users.filters.inactive') }]"
          @update:model-value="loadFirstPage"
        />
      </div>
      <AppButton variant="outline" @click="loadFirstPage">{{ t('users.filters.apply') }}</AppButton>
    </div>

    <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1">
      <div v-if="selected.size > 0" class="mt-4 flex items-center justify-between rounded-lg border border-primary/25 bg-primary-subtle px-4 py-2.5">
        <p class="text-small font-medium text-primary">{{ selected.size }} {{ t('users.selected') }}</p>
        <AppButton variant="danger" size="sm" icon="trash" @click="bulkDeactivate">{{ t('users.deactivate') }}</AppButton>
      </div>
    </Transition>

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <div class="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-border text-caption font-semibold uppercase tracking-wide text-ink-faint">
            <th class="w-10 px-4 py-3"><input type="checkbox" :checked="allSelected" class="h-4 w-4 rounded border-border-strong" @change="toggleAll" /></th>
            <th class="px-2 py-3">{{ t('users.fields.fullName') }}</th>
            <th class="px-4 py-3">{{ t('users.role') }}</th>
            <th class="px-4 py-3">{{ t('users.fields.department') }}</th>
            <th class="px-4 py-3">{{ t('dashboard.progress.title') }}</th>
            <th class="px-4 py-3">{{ t('users.status') }}</th>
            <th class="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 6" :key="i" class="border-b border-border last:border-0">
              <td class="px-4 py-3"><Skeleton class="h-4 w-4" /></td>
              <td class="px-2 py-3"><Skeleton class="h-4 w-40" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-20" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
              <td class="px-4 py-3"><Skeleton class="h-4 w-16" /></td>
              <td class="px-4 py-3" />
            </tr>
          </template>
          <tr
            v-for="user in items"
            :key="user.id"
            class="cursor-pointer border-b border-border text-small transition-default last:border-0 hover:bg-surface-2"
            @click="router.push(`/admin/users/${user.id}`)"
          >
            <td class="px-4 py-3" @click.stop>
              <input type="checkbox" :checked="selected.has(user.id)" class="h-4 w-4 rounded border-border-strong" @change="toggleOne(user.id)" />
            </td>
            <td class="px-2 py-3">
              <div class="flex items-center gap-2.5">
                <Avatar :name="user.fullName" :src="user.avatar" size="sm" />
                <div class="min-w-0">
                  <p class="truncate font-medium text-ink">{{ user.fullName }}</p>
                  <p class="truncate text-caption text-ink-faint">{{ user.username }}</p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3"><Badge variant="neutral" size="sm">{{ user.role }}</Badge></td>
            <td class="px-4 py-3 text-ink-muted">{{ user.department || '—' }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="w-20"><ProgressBar :value="seededPercent(user.id)" size="sm" /></div>
                <span class="text-caption text-ink-faint">{{ seededPercent(user.id) }}%</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <Badge :variant="user.isActive ? 'success' : 'danger'" dot size="sm">
                {{ user.isActive ? t('users.filters.active') : t('users.filters.inactive') }}
              </Badge>
            </td>
            <td class="px-4 py-3 text-ink-faint"><Icon name="chevron-right" size="15" /></td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && items.length === 0" icon="users" :title="t('users.empty')" />
    </div>

    <div class="mt-4 flex justify-center">
      <AppButton v-if="nextCursor" variant="outline" :loading="loading" @click="loadMore">{{ t('users.loadMore') }}</AppButton>
    </div>

    <Modal v-model="showCreateModal" :title="t('users.newUser')" size="lg">
      <form class="grid grid-cols-2 gap-4" @submit.prevent="onCreateSubmit">
        <AppInput v-model="createForm.fullName" required :label="t('users.fields.fullName')" />
        <AppInput v-model="createForm.username" required :label="t('users.fields.username')" />
        <AppInput v-model="createForm.email" type="email" required :label="t('users.fields.email')" />
        <AppInput v-model="createForm.phone" :label="t('users.fields.phone')" />
        <AppSelect v-model="createForm.roleName" :label="t('users.role')" :options="roleOptions" />
        <AppInput v-model="createForm.department" :label="t('users.fields.department')" />
        <AppInput v-model="createForm.position" :label="t('users.fields.position')" />
        <AppInput v-model="createForm.password" type="password" required :label="t('users.fields.password')" />

        <p v-if="createError" class="col-span-2 text-small text-danger">{{ createError }}</p>

        <div class="col-span-2 flex justify-end gap-2 pt-2">
          <AppButton type="button" variant="ghost" @click="showCreateModal = false">{{ t('users.cancel') }}</AppButton>
          <AppButton type="submit" :loading="createSubmitting">{{ createSubmitting ? t('users.creating') : t('users.create') }}</AppButton>
        </div>
      </form>
    </Modal>
  </div>
</template>
