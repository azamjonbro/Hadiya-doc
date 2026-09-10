<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({ courseId: { type: String, required: true } })

const { t, locale } = useI18n()
const toast = useToast()

const loading = ref(true)
const rows = ref([]) // [{ assignment, user }]

const search = ref('')
const results = ref([])
const selectedUser = ref(null)
const form = reactive({ mandatory: true, deadline: '', expiresAt: '' })
const submitting = ref(false)
const errorMessage = ref('')

async function load() {
  loading.value = true
  try {
    const assignments = await coursesApi.listAssignments(props.courseId)
    const users = await Promise.all(assignments.map((a) => usersApi.getById(a.userId).catch(() => null)))
    rows.value = assignments.map((a, i) => ({ assignment: a, user: users[i] }))
  } finally {
    loading.value = false
  }
}

async function onSearch() {
  // Wrapped rather than left bare: an unhandled rejection here used to
  // take the whole handler down silently. No toast — this runs on every
  // keystroke or scroll, and a banner per failed attempt is worse than
  // the empty list the reader already sees.
  try {
    if (!search.value) {
      results.value = []
      return
    }
    const { items } = await usersApi.list({ search: search.value, limit: 5 })
    results.value = items
  } catch {
    /* nothing to show; the list simply does not grow */
  }
}

function pickUser(user) {
  selectedUser.value = user
  search.value = user.fullName
  results.value = []
}

async function onAssign() {
  if (!selectedUser.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await coursesApi.assign(props.courseId, {
      userId: selectedUser.value.id,
      mandatory: form.mandatory,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
    })
    toast.success(t('courses.access.assigned'))
    selectedUser.value = null
    search.value = ''
    Object.assign(form, { mandatory: true, deadline: '', expiresAt: '' })
    await load()
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="rounded-lg border border-border bg-surface-2 p-4">
      <p class="text-small font-semibold text-ink">{{ t('courses.access.assign') }}</p>
      <div class="relative mt-3">
        <AppInput v-model="search" icon="search" :placeholder="t('videoReport.searchUser')" @input="onSearch" />
        <ul v-if="results.length > 0" class="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface text-small shadow-md">
          <li v-for="user in results" :key="user.id" class="cursor-pointer px-3 py-2 transition-default hover:bg-surface-2" @click="pickUser(user)">
            {{ user.fullName }} <span class="text-ink-faint">({{ user.jshshir }})</span>
          </li>
        </ul>
      </div>

      <div v-if="selectedUser" class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="sm:col-span-2 flex items-center gap-2 text-small text-ink">
          <input v-model="form.mandatory" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
          {{ t('courses.mandatory') }}
        </label>
        <AppDatePicker v-model="form.deadline" :label="t('courses.deadline')" />
        <AppDatePicker v-model="form.expiresAt" :label="t('courses.access.expiresAt')" />
        <p v-if="errorMessage" class="sm:col-span-2 text-small text-danger">{{ errorMessage }}</p>
        <div class="sm:col-span-2">
          <AppButton size="sm" :loading="submitting" @click="onAssign">{{ t('courses.access.assign') }}</AppButton>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <div v-if="loading" class="space-y-2">
        <Skeleton v-for="i in 3" :key="i" class="h-10 w-full" />
      </div>
      <div v-else-if="rows.length" class="divide-y divide-border rounded-lg border border-border bg-surface">
        <div v-for="row in rows" :key="row.assignment.id" class="flex items-center justify-between gap-3 px-4 py-2.5">
          <div class="flex min-w-0 items-center gap-2.5">
            <Avatar :name="row.user?.fullName ?? '?'" size="xs" />
            <span class="truncate text-small text-ink">{{ row.user?.fullName ?? row.assignment.userId }}</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge :variant="row.assignment.mandatory ? 'primary' : 'neutral'" size="sm">{{ row.assignment.mandatory ? t('courses.mandatory') : t('courses.optional') }}</Badge>
            <span v-if="row.assignment.deadline" class="text-caption text-ink-faint">{{ new Date(row.assignment.deadline).toLocaleDateString(locale) }}</span>
          </div>
        </div>
      </div>
      <EmptyState v-else icon="users" :title="t('courses.access.empty')" />
    </div>
  </div>
</template>
