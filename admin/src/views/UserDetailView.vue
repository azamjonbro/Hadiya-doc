<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/services/users'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const roleOptions = Object.values(ROLES).map((r) => ({ value: r, label: r }))

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const deactivating = ref(false)
const coursesLoading = ref(true)
const assignments = ref([])

const form = reactive({ fullName: '', phone: '', department: '', position: '', roleName: '', isActive: true, password: '', avatar: '' })
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
    form.avatar = user.value.avatar
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function loadCourses() {
  coursesLoading.value = true
  try {
    const myAssignments = await coursesApi.myAssignments(route.params.id)
    const courses = await Promise.all(myAssignments.map((a) => coursesApi.getById(a.courseId)))
    assignments.value = myAssignments.map((a, i) => ({ ...a, course: courses[i] }))
  } catch {
    assignments.value = []
  } finally {
    coursesLoading.value = false
  }
}

async function onSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = { ...form }
    if (!payload.password) delete payload.password
    user.value = await usersApi.update(route.params.id, payload)
    toast.success(t('users.save'))
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

function assignmentTone(a) {
  if (a.isExpired) return 'danger'
  if (a.status === 'COMPLETED') return 'success'
  if (a.isOverdue) return 'warning'
  return 'primary'
}

onMounted(() => {
  load()
  loadCourses()
})
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/admin/users')">
      <Icon name="chevron-left" size="16" />
      {{ t('users.title') }}
    </button>

    <Skeleton v-if="loading" class="mt-5 h-24 w-full" />
    <p v-if="errorMessage && !loading" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="user">
      <div class="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <Avatar :name="user.fullName" :src="form.avatar" size="xl" />
          <div>
            <h1 class="text-h1 text-ink">{{ user.fullName }}</h1>
            <p class="mt-1 text-small text-ink-muted">{{ user.username }} · {{ user.email }}</p>
            <div class="mt-2 flex items-center gap-2">
              <Badge variant="neutral">{{ user.role }}</Badge>
              <Badge :variant="user.isActive ? 'success' : 'danger'" dot>{{ user.isActive ? t('users.filters.active') : t('users.filters.inactive') }}</Badge>
              <span v-if="user.department" class="text-caption text-ink-faint">{{ user.department }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Profile form -->
        <AppCard class="lg:col-span-2">
          <h2 class="text-h3 text-ink">{{ t('settings.sections.profile') }}</h2>
          <form class="mt-4 grid grid-cols-2 gap-4" @submit.prevent="onSave">
            <div class="col-span-2 max-w-[10rem]">
              <ImageUploadField
                v-model="form.avatar"
                :label="t('users.fields.avatar')"
                aspect="aspect-square"
                :disabled="!auth.hasPermission('user:update')"
              />
            </div>
            <div class="col-span-2">
              <AppInput v-model="form.fullName" :label="t('users.fields.fullName')" :disabled="!auth.hasPermission('user:update')" />
            </div>
            <AppInput v-model="form.phone" :label="t('users.fields.phone')" :disabled="!auth.hasPermission('user:update')" />
            <AppInput v-model="form.department" :label="t('users.fields.department')" :disabled="!auth.hasPermission('user:update')" />
            <AppInput v-model="form.position" :label="t('users.fields.position')" :disabled="!auth.hasPermission('user:update')" />
            <AppSelect v-model="form.roleName" :label="t('users.role')" :options="roleOptions" :disabled="!auth.hasPermission('user:update')" />
            <label class="col-span-2 flex items-center gap-2 text-small font-medium text-ink">
              <input v-model="form.isActive" type="checkbox" :disabled="!auth.hasPermission('user:update')" class="h-4 w-4 rounded border-border-strong text-primary" />
              {{ t('users.filters.active') }}
            </label>
            <div class="col-span-2">
              <AppInput v-model="form.password" type="password" :label="t('users.fields.newPassword')" :hint="t('users.fields.newPasswordHint')" :disabled="!auth.hasPermission('user:update')" />
            </div>

            <p v-if="errorMessage" class="col-span-2 text-small text-danger">{{ errorMessage }}</p>

            <div v-if="auth.hasPermission('user:update')" class="col-span-2 flex gap-3 pt-2">
              <AppButton type="submit" :loading="saving">{{ saving ? t('users.saving') : t('users.save') }}</AppButton>
              <AppButton v-if="auth.hasPermission('user:delete')" type="button" variant="danger" :loading="deactivating" @click="onDeactivate">
                {{ deactivating ? t('users.deactivating') : t('users.deactivate') }}
              </AppButton>
            </div>
          </form>
        </AppCard>

        <!-- Assigned courses -->
        <AppCard padding="none">
          <h2 class="px-5 pt-5 text-h3 text-ink">{{ t('courses.title') }}</h2>
          <div class="mt-3 divide-y divide-border">
            <div v-if="coursesLoading" class="space-y-3 p-5">
              <Skeleton v-for="i in 3" :key="i" class="h-4 w-full" />
            </div>
            <template v-else-if="assignments.length">
              <div
                v-for="a in assignments"
                :key="a.id"
                class="cursor-pointer px-5 py-3 transition-default hover:bg-surface-2"
                @click="router.push(`/admin/courses/${a.courseId}`)"
              >
                <p class="truncate text-small font-medium text-ink">{{ a.course?.title }}</p>
                <div class="mt-1 flex items-center gap-2">
                  <Badge :variant="assignmentTone(a)" size="sm">{{ a.status }}</Badge>
                  <span v-if="a.deadline" class="text-caption text-ink-faint">{{ new Date(a.deadline).toLocaleDateString(locale) }}</span>
                </div>
              </div>
            </template>
            <EmptyState v-else icon="graduation-cap" :title="t('courses.empty')" />
          </div>
          <div class="h-4" />
        </AppCard>
      </div>
    </template>
  </div>
</template>
