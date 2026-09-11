<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { groupsApi } from '@/services/groups'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const canManage = auth.hasPermission('course:assign')

const loading = ref(true)
const errorMessage = ref('')
const groups = ref([])
const search = ref('')

const showCreate = ref(false)
const creating = ref(false)
const createError = ref('')
const createForm = reactive({ name: '', description: '', department: '' })

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    groups.value = await groupsApi.list(search.value ? { search: search.value } : {})
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createForm.name = ''
  createForm.description = ''
  createForm.department = ''
  createError.value = ''
  showCreate.value = true
}

async function onCreate() {
  creating.value = true
  createError.value = ''
  try {
    const group = await groupsApi.create({ ...createForm })
    showCreate.value = false
    toast.success(t('groups.created'))
    router.push(`/bos/groups/${group.id}`)
  } catch (error) {
    createError.value = apiErrorText(error)
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <!-- Rasn 10: title, one line of help, "New group" on the right; the
         search is a small field under it; then a flat table with a
         group icon, the name and the head-count -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('groups.title') }}</h1>
        <p class="mt-1 max-w-2xl text-[14px] text-ink-muted">{{ t('groups.emptyHint') }}</p>
      </div>
      <AppButton v-if="canManage" icon="users" @click="openCreate">{{ t('groups.newGroup') }}</AppButton>
    </div>

    <form class="mt-5 flex flex-wrap items-center gap-3" @submit.prevent="load">
      <div class="w-full max-w-xs">
        <AppInput v-model="search" :placeholder="t('groups.searchPlaceholder')" icon="search" />
      </div>
    </form>

    <div v-if="loading" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-32 w-full" />
    </div>

    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <EmptyState
      v-else-if="!groups.length"
      icon="users"
      :title="t('groups.empty')"
      :description="t('groups.emptyHint')"
    >
      <template v-if="canManage" #action>
        <AppButton icon="plus" @click="openCreate">{{ t('groups.newGroup') }}</AppButton>
      </template>
    </EmptyState>

    <table v-else class="mt-5 w-full text-[14px]">
      <thead>
        <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
          <th class="pl-3 pr-2 font-medium text-ink">{{ t('groups.fields.name') }} <Icon name="chevron-up" size="12" class="inline text-ink-faint" /></th>
          <th class="w-48 px-2 font-medium">{{ t('groups.fields.department') }}</th>
          <th class="w-40 px-2 font-medium">{{ t('courses.title') }}</th>
          <th class="w-40 pr-3 font-medium">{{ t('users.title') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="group in groups"
          :key="group.id"
          class="h-14 cursor-pointer border-b border-border transition-default last:border-b-0 hover:bg-surface-2"
          @click="router.push(`/bos/groups/${group.id}`)"
        >
          <td class="pl-3 pr-2">
            <span class="flex items-center gap-3">
              <Icon name="users" size="18" class="text-ink-muted" />
              <span class="min-w-0">
                <span class="block truncate text-ink">{{ group.name }}</span>
                <span v-if="group.description" class="block truncate text-caption text-ink-muted">{{ group.description }}</span>
              </span>
            </span>
          </td>
          <td class="px-2 text-ink-muted">{{ group.department || '—' }}</td>
          <td class="px-2 text-ink">{{ group.courseCount }}</td>
          <td class="pr-3 text-ink">{{ group.memberCount }}</td>
        </tr>
      </tbody>
    </table>

    <Modal v-model="showCreate" :title="t('groups.newGroup')" :description="t('groups.newGroupHint')">
      <form id="create-group" class="space-y-4" @submit.prevent="onCreate">
        <AppInput v-model="createForm.name" :label="t('groups.fields.name')" required />
        <AppInput v-model="createForm.description" :label="t('groups.fields.description')" />
        <AppInput v-model="createForm.department" :label="t('groups.fields.department')" :hint="t('groups.fields.departmentHint')" />
        <p v-if="createError" class="text-small text-danger">{{ createError }}</p>
      </form>
      <template #footer>
        <AppButton variant="ghost" @click="showCreate = false">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" form="create-group" :loading="creating" :disabled="!createForm.name">
          {{ t('groups.create') }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
