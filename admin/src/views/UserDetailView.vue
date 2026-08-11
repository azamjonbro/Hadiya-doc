<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const roleOptions = Object.values(ROLES)

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const deactivating = ref(false)

const form = reactive({
  fullName: '',
  phone: '',
  department: '',
  position: '',
  roleName: '',
  isActive: true,
  password: '',
})
const user = ref(null)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    user.value = await usersApi.getById(route.params.id)
    form.fullName = user.value.fullName
    form.phone = user.value.phone
    form.department = user.value.department
    form.position = user.value.position
    form.roleName = user.value.role
    form.isActive = user.value.isActive
    form.password = ''
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = { ...form }
    if (!payload.password) delete payload.password
    user.value = await usersApi.update(route.params.id, payload)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function onDeactivate() {
  deactivating.value = true
  errorMessage.value = ''
  try {
    await usersApi.deactivate(route.params.id)
    router.push('/admin/users')
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    deactivating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <button type="button" class="text-sm text-slate-500 dark:text-slate-400" @click="router.push('/admin/users')">
      ← {{ t('users.title') }}
    </button>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('users.loading') }}</p>

    <template v-else-if="user">
      <h1 class="mt-4 text-xl font-semibold tracking-tight">{{ user.fullName }}</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">{{ user.username }} · {{ user.email }}</p>

      <form class="mt-6 grid grid-cols-2 gap-3" @submit.prevent="onSave">
        <label class="col-span-2 text-sm font-medium">
          {{ t('users.fields.fullName') }}
          <input v-model="form.fullName" :disabled="!auth.hasPermission('user:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="text-sm font-medium">
          {{ t('users.fields.phone') }}
          <input v-model="form.phone" :disabled="!auth.hasPermission('user:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="text-sm font-medium">
          {{ t('users.fields.department') }}
          <input v-model="form.department" :disabled="!auth.hasPermission('user:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="text-sm font-medium">
          {{ t('users.fields.position') }}
          <input v-model="form.position" :disabled="!auth.hasPermission('user:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="text-sm font-medium">
          {{ t('users.role') }}
          <select v-model="form.roleName" :disabled="!auth.hasPermission('user:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700">
            <option v-for="role in roleOptions" :key="role" :value="role">{{ role }}</option>
          </select>
        </label>
        <label class="col-span-2 flex items-center gap-2 text-sm font-medium">
          <input v-model="form.isActive" type="checkbox" :disabled="!auth.hasPermission('user:update')" />
          {{ t('users.filters.active') }}
        </label>
        <label class="col-span-2 text-sm font-medium">
          {{ t('users.fields.newPassword') }}
          <input v-model="form.password" type="password" :disabled="!auth.hasPermission('user:update')" :placeholder="t('users.fields.newPasswordHint')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>

        <p v-if="errorMessage" class="col-span-2 text-sm text-red-500">{{ errorMessage }}</p>

        <div v-if="auth.hasPermission('user:update')" class="col-span-2 flex gap-3">
          <button
            type="submit"
            :disabled="saving"
            class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {{ saving ? t('users.saving') : t('users.save') }}
          </button>
          <button
            v-if="auth.hasPermission('user:delete')"
            type="button"
            :disabled="deactivating"
            class="rounded-md border border-red-400 px-4 py-2 text-sm font-medium text-red-500 disabled:opacity-50"
            @click="onDeactivate"
          >
            {{ deactivating ? t('users.deactivating') : t('users.deactivate') }}
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
