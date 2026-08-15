<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { groupsApi } from '@/services/groups'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Modal from '@/components/ui/Modal.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

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
    errorMessage.value = error.response?.data?.message ?? String(error)
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
    router.push(`/admin/groups/${group.id}`)
  } catch (error) {
    createError.value = error.response?.data?.message ?? String(error)
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-h1 text-ink">{{ t('groups.title') }}</h1>
      <AppButton v-if="canManage" icon="plus" @click="openCreate">{{ t('groups.newGroup') }}</AppButton>
    </div>

    <form class="mt-5 flex flex-wrap items-center gap-3" @submit.prevent="load">
      <div class="w-full max-w-xs">
        <AppInput v-model="search" :placeholder="t('groups.searchPlaceholder')" icon="search" />
      </div>
      <AppButton type="submit" variant="secondary">{{ t('common.filter') }}</AppButton>
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

    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard
        v-for="group in groups"
        :key="group.id"
        hover
        as="button"
        class="text-left"
        @click="router.push(`/admin/groups/${group.id}`)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-h3 text-ink">{{ group.name }}</h2>
            <p v-if="group.description" class="mt-1 line-clamp-2 text-small text-ink-muted">{{ group.description }}</p>
          </div>
          <Icon name="chevron-right" size="16" class="mt-1 shrink-0 text-ink-faint" />
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="primary" size="sm">{{ t('groups.memberCount', { count: group.memberCount }) }}</Badge>
          <Badge variant="info" size="sm">{{ t('groups.courseCount', { count: group.courseCount }) }}</Badge>
          <span v-if="group.department" class="text-caption text-ink-faint">{{ group.department }}</span>
        </div>
      </AppCard>
    </div>

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
