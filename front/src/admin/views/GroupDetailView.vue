<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import { groupsApi } from '@/services/groups'
import { usersApi } from '@/services/users'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import GroupLeaderboard from '@/admin/components/groups/GroupLeaderboard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const canManage = auth.hasPermission('course:assign')

const loading = ref(true)
const errorMessage = ref('')
const group = ref(null)
const busy = ref(false)

const TAB_VALUES = ['members', 'courses', 'leaderboard']
const activeTab = ref(TAB_VALUES.includes(route.query.tab) ? route.query.tab : 'members')

const tabs = computed(() => [
  { value: 'members', label: t('groups.tabs.members'), count: group.value?.memberCount ?? 0 },
  { value: 'courses', label: t('groups.tabs.courses'), count: group.value?.courseCount ?? 0 },
  { value: 'leaderboard', label: t('groups.tabs.leaderboard') },
])

// --- member picker -------------------------------------------------------
const showAddMembers = ref(false)
const memberSearch = ref('')
const memberResults = ref([])
const memberSearching = ref(false)
const pickedUserIds = ref(new Set())

// --- course picker -------------------------------------------------------
const showAddCourses = ref(false)
const courseOptions = ref([])
const pickedCourseIds = ref(new Set())

// --- edit / delete -------------------------------------------------------
const showEdit = ref(false)
const editForm = ref({ name: '', description: '', department: '' })
const showDelete = ref(false)

// courses.status.* is keyed in lowercase (draft/published/archived) while
// the API returns the enum in caps.
function courseStatusLabel(status) {
  return t(`courses.status.${status.toLowerCase()}`)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    group.value = await groupsApi.getById(route.params.id)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function searchMembers() {
  memberSearching.value = true
  try {
    const result = await usersApi.list(memberSearch.value ? { search: memberSearch.value } : {})
    // Already-in-the-group people are filtered out rather than shown greyed:
    // the picker is for adding, and re-picking them would be a no-op anyway.
    const memberIds = new Set(group.value?.memberIds ?? [])
    memberResults.value = result.items.filter((user) => !memberIds.has(user.id))
  } finally {
    memberSearching.value = false
  }
}

function openAddMembers() {
  pickedUserIds.value = new Set()
  memberSearch.value = ''
  showAddMembers.value = true
  searchMembers()
}

function togglePickedUser(id) {
  const next = new Set(pickedUserIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  pickedUserIds.value = next
}

async function onAddMembers() {
  busy.value = true
  try {
    group.value = await groupsApi.addMembers(route.params.id, [...pickedUserIds.value])
    showAddMembers.value = false
    toast.success(t('groups.membersAdded'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

async function onRemoveMember(userId) {
  const member = group.value?.members?.find((m) => m.id === userId)
  if (!(await confirm.ask({ message: t('confirm.removeGroupMember', { name: member?.fullName ?? '' }) }))) return
  busy.value = true
  try {
    group.value = await groupsApi.removeMember(route.params.id, userId)
    toast.success(t('groups.memberRemoved'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

async function openAddCourses() {
  pickedCourseIds.value = new Set()
  showAddCourses.value = true
  try {
    const result = await coursesApi.list({})
    const attached = new Set(group.value?.courseIds ?? [])
    courseOptions.value = result.items.filter((course) => !attached.has(course.id))
  } catch (error) {
    // The dialog stays open with an empty list rather than vanishing — the
    // message says why there is nothing to pick from.
    courseOptions.value = []
    toast.error(apiErrorText(error, t('courses.loadFailed')))
  }
}

function togglePickedCourse(id) {
  const next = new Set(pickedCourseIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  pickedCourseIds.value = next
}

async function onAddCourses() {
  busy.value = true
  try {
    group.value = await groupsApi.addCourses(route.params.id, [...pickedCourseIds.value])
    showAddCourses.value = false
    toast.success(t('groups.coursesAdded'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

async function onRemoveCourse(courseId) {
  busy.value = true
  try {
    group.value = await groupsApi.removeCourse(route.params.id, courseId)
    toast.success(t('groups.courseRemoved'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

function openEdit() {
  editForm.value = {
    name: group.value.name,
    description: group.value.description,
    department: group.value.department,
  }
  showEdit.value = true
}

async function onEdit() {
  busy.value = true
  try {
    await groupsApi.update(route.params.id, editForm.value)
    showEdit.value = false
    await load()
    toast.success(t('groups.saved'))
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

async function onDelete() {
  if (!(await confirm.ask({ message: t('confirm.deleteGroup', { title: group.value?.title ?? '' }) }))) return
  busy.value = true
  try {
    await groupsApi.remove(route.params.id)
    router.push('/bos/groups')
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

watch(activeTab, (tab) => router.replace({ query: { ...route.query, tab } }))
onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <button
      type="button"
      class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink"
      @click="router.push('/bos/groups')"
    >
      <Icon name="chevron-left" size="16" />
      {{ t('groups.title') }}
    </button>

    <Skeleton v-if="loading" class="mt-5 h-24 w-full" />
    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="group">
      <div class="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-[28px] font-bold text-ink">{{ group.name }}</h1>
          <p v-if="group.description" class="mt-1 text-small text-ink-muted">{{ group.description }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="primary" size="sm">{{ t('groups.memberCount', { count: group.memberCount }) }}</Badge>
            <Badge variant="info" size="sm">{{ t('groups.courseCount', { count: group.courseCount }) }}</Badge>
            <span v-if="group.department" class="text-caption text-ink-faint">{{ group.department }}</span>
          </div>
        </div>
        <div v-if="canManage" class="flex gap-2">
          <AppButton variant="outline" icon="pencil" @click="openEdit">{{ t('groups.edit') }}</AppButton>
          <AppButton variant="ghost" icon="trash" @click="showDelete = true">{{ t('groups.delete') }}</AppButton>
        </div>
      </div>

      <div class="mt-7"><Tabs v-model="activeTab" :tabs="tabs" /></div>

      <!-- Members -->
      <div v-if="activeTab === 'members'" class="mt-6">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-h3 text-ink">{{ t('groups.tabs.members') }}</h2>
          <AppButton v-if="canManage" icon="plus" size="sm" @click="openAddMembers">{{ t('groups.addMembers') }}</AppButton>
        </div>

        <EmptyState v-if="!group.members.length" icon="users" :title="t('groups.noMembers')" :description="t('groups.noMembersHint')" />

        <ul v-else class="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          <li v-for="member in group.members" :key="member.id" class="flex items-center gap-3 px-4 py-3">
            <Avatar :name="member.fullName" :src="member.avatar" size="sm" />
            <button
              type="button"
              class="min-w-0 flex-1 text-left transition-default hover:text-primary"
              @click="router.push(`/bos/users/${member.id}`)"
            >
              <p class="truncate text-small font-medium text-ink">{{ member.fullName }}</p>
              <p class="truncate text-caption text-ink-faint">
                {{ member.jshshir }}<template v-if="member.position"> · {{ member.position }}</template>
              </p>
            </button>
            <Badge v-if="!member.isActive" variant="danger" size="sm">{{ t('users.filters.inactive') }}</Badge>
            <AppButton
              v-if="canManage"
              variant="ghost"
              size="sm"
              icon="close"
              :disabled="busy"
              :aria-label="t('groups.removeMember')"
              @click="onRemoveMember(member.id)"
            />
          </li>
        </ul>
      </div>

      <!-- Courses -->
      <div v-else-if="activeTab === 'courses'" class="mt-6">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-h3 text-ink">{{ t('groups.tabs.courses') }}</h2>
            <p class="mt-0.5 text-caption text-ink-muted">{{ t('groups.coursesHint') }}</p>
          </div>
          <AppButton v-if="canManage" icon="plus" size="sm" @click="openAddCourses">{{ t('groups.addCourses') }}</AppButton>
        </div>

        <EmptyState v-if="!group.courses.length" icon="book-open" :title="t('groups.noCourses')" :description="t('groups.noCoursesHint')" />

        <ul v-else class="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          <li v-for="course in group.courses" :key="course.id" class="flex items-center gap-3 px-4 py-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Icon name="book-open" size="15" />
            </span>
            <button
              type="button"
              class="min-w-0 flex-1 text-left transition-default hover:text-primary"
              @click="router.push(`/bos/courses/${course.id}`)"
            >
              <p class="truncate text-small font-medium text-ink">{{ course.title }}</p>
            </button>
            <Badge :variant="course.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
              {{ courseStatusLabel(course.status) }}
            </Badge>
            <AppButton
              v-if="canManage"
              variant="ghost"
              size="sm"
              icon="close"
              :disabled="busy"
              :aria-label="t('groups.removeCourse')"
              @click="onRemoveCourse(course.id)"
            />
          </li>
        </ul>
      </div>

      <!-- Leaderboard -->
      <GroupLeaderboard v-else-if="activeTab === 'leaderboard'" class="mt-6" :group-id="group.id" />
    </template>

    <!-- Add members -->
    <Modal v-model="showAddMembers" size="lg" :title="t('groups.addMembers')" :description="t('groups.addMembersHint')">
      <form class="flex gap-2" @submit.prevent="searchMembers">
        <div class="flex-1"><AppInput v-model="memberSearch" :placeholder="t('users.filters.search')" icon="search" /></div>
        <AppButton type="submit" variant="secondary" :loading="memberSearching">{{ t('common.search') }}</AppButton>
      </form>

      <ul class="mt-4 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="user in memberResults" :key="user.id">
          <label class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-default hover:bg-surface-2">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-border-strong text-primary"
              :checked="pickedUserIds.has(user.id)"
              @change="togglePickedUser(user.id)"
            />
            <Avatar :name="user.fullName" :src="user.avatar" size="xs" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-small text-ink">{{ user.fullName }}</span>
              <span class="block truncate text-caption text-ink-faint">{{ user.jshshir }} · {{ user.role }}</span>
            </span>
          </label>
        </li>
        <li v-if="!memberResults.length" class="px-3 py-6 text-center text-small text-ink-faint">{{ t('users.empty') }}</li>
      </ul>

      <template #footer>
        <AppButton variant="ghost" @click="showAddMembers = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="busy" :disabled="!pickedUserIds.size" @click="onAddMembers">
          {{ t('groups.addSelected', { count: pickedUserIds.size }) }}
        </AppButton>
      </template>
    </Modal>

    <!-- Add courses -->
    <Modal v-model="showAddCourses" size="lg" :title="t('groups.addCourses')" :description="t('groups.addCoursesHint')">
      <ul class="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="course in courseOptions" :key="course.id">
          <label class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-default hover:bg-surface-2">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-border-strong text-primary"
              :checked="pickedCourseIds.has(course.id)"
              @change="togglePickedCourse(course.id)"
            />
            <span class="min-w-0 flex-1 truncate text-small text-ink">{{ course.title }}</span>
            <Badge :variant="course.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
              {{ courseStatusLabel(course.status) }}
            </Badge>
          </label>
        </li>
        <li v-if="!courseOptions.length" class="px-3 py-6 text-center text-small text-ink-faint">{{ t('courses.empty') }}</li>
      </ul>

      <template #footer>
        <AppButton variant="ghost" @click="showAddCourses = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="busy" :disabled="!pickedCourseIds.size" @click="onAddCourses">
          {{ t('groups.addSelected', { count: pickedCourseIds.size }) }}
        </AppButton>
      </template>
    </Modal>

    <!-- Edit -->
    <Modal v-model="showEdit" :title="t('groups.edit')">
      <form id="edit-group" class="space-y-4" @submit.prevent="onEdit">
        <AppInput v-model="editForm.name" :label="t('groups.fields.name')" required />
        <AppInput v-model="editForm.description" :label="t('groups.fields.description')" />
        <AppInput v-model="editForm.department" :label="t('groups.fields.department')" />
      </form>
      <template #footer>
        <AppButton variant="ghost" @click="showEdit = false">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" form="edit-group" :loading="busy">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- Delete -->
    <Modal v-model="showDelete" size="sm" :title="t('groups.delete')" :description="t('groups.deleteHint')">
      <template #footer>
        <AppButton variant="ghost" @click="showDelete = false">{{ t('common.cancel') }}</AppButton>
        <AppButton variant="danger" :loading="busy" @click="onDelete">{{ t('groups.delete') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
