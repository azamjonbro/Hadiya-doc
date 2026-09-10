<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '@/composables/useConfirm'
import { ROLES } from '@lms/shared'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import { topicsApi } from '@/services/topics'
import TopicContentPanel from '@/admin/components/TopicContentPanel.vue'
import AssignCoursePanel from '@/admin/components/AssignCoursePanel.vue'
import CourseDangerActions from '@/admin/components/CourseDangerActions.vue'
import AttentionPolicyForm from '@/admin/components/AttentionPolicyForm.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import BranchSelect from '@/components/ui/BranchSelect.vue'
import { usersApi } from '@/services/users'
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

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const course = ref(null)

// The branches an admin can target are the ones employees are actually in —
// targeting a branch nobody belongs to just hides the course from everyone.
// `allow-create` still lets a new office be named here before its first hire.
const branchOptions = ref([])
usersApi
  .branches()
  .then((names) => {
    branchOptions.value = names
  })
  .catch(() => {
    branchOptions.value = []
  })
const topics = ref([])
const expandedVideosTopicId = ref(null)

const form = reactive({ title: '', description: '', status: 'DRAFT', targetRoles: [], branches: [], department: '', autoAssign: false })
const showEditForm = ref(false)

const roleList = Object.values(ROLES)
function toggleRole(role) {
  const idx = form.targetRoles.indexOf(role)
  if (idx === -1) form.targetRoles.push(role)
  else form.targetRoles.splice(idx, 1)
}
const hasTargeting = computed(
  () => form.targetRoles.length > 0 || form.branches.length > 0 || form.department.trim().length > 0
)

const showAddTopic = ref(false)
const addTopicSubmitting = ref(false)
const addTopicError = ref('')
const addTopicForm = reactive({ title: '', order: 0, status: 'DRAFT' })

function nextTopicOrder() {
  return topics.value.length ? Math.max(...topics.value.map((tp) => tp.order)) + 1 : 0
}

function toggleAddTopic() {
  showAddTopic.value = !showAddTopic.value
  if (showAddTopic.value) addTopicForm.order = nextTopicOrder()
}

const editingTopicId = ref(null)
const editTopicForm = reactive({ title: '', order: 0, status: 'DRAFT' })

const statusOptions = [
  { value: 'DRAFT', label: 'courses.status.draft' },
  { value: 'PUBLISHED', label: 'courses.status.published' },
  { value: 'ARCHIVED', label: 'courses.status.archived' },
]

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    course.value = await coursesApi.getById(route.params.id)
    form.title = course.value.title
    form.description = course.value.description
    form.status = course.value.status
    form.targetRoles = [...(course.value.targetRoles ?? [])]
    form.branches = [...(course.value.branches ?? [])]
  form.department = course.value.department ?? ''
    form.autoAssign = false
    topics.value = await coursesApi.listTopics(route.params.id)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function onSave() {
  saving.value = true
  errorMessage.value = ''
  try {
    course.value = await coursesApi.update(route.params.id, { ...form })
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    saving.value = false
  }
}

const duplicating = ref(false)

async function duplicateCourse() {
  // Asked first: it creates a whole second course, and an accidental click
  // on a large one leaves a mess somebody has to clean up by hand.
  const ok = await confirm({
    title: t('courses.duplicateTitle'),
    message: t('courses.duplicateMessage', { title: course.value.title }),
    danger: false,
  })
  if (!ok) return
  duplicating.value = true
  try {
    const result = await coursesApi.duplicate(course.value.id)
    // Straight to the copy: the next thing anyone does is edit it, and the
    // copy is a draft, so nothing is live while they do.
    router.push(`/bos/courses/${result.course.id}`)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    duplicating.value = false
  }
}

// Both emitted by CourseDangerActions, which owns the confirmation dialogs
// and the API calls themselves.
function onCourseArchived(updated) {
  course.value = updated
  form.status = updated.status
}

// The course this page is about no longer exists — there is nothing left to
// render here, so fall back to the list.
function onCourseDeleted() {
  router.push('/bos/courses')
}

async function onAddTopicSubmit() {
  addTopicSubmitting.value = true
  addTopicError.value = ''
  try {
    const topic = await coursesApi.createTopic(route.params.id, { ...addTopicForm })
    topics.value = [...topics.value, topic].sort((a, b) => a.order - b.order)
    showAddTopic.value = false
    Object.assign(addTopicForm, { title: '', order: nextTopicOrder(), status: 'DRAFT' })
  } catch (error) {
    addTopicError.value = apiErrorText(error)
  } finally {
    addTopicSubmitting.value = false
  }
}

function startEditTopic(topic) {
  editingTopicId.value = topic.id
  editTopicForm.title = topic.title
  editTopicForm.order = topic.order
  editTopicForm.status = topic.status
}

async function saveTopicEdit(topicId) {
  try {
    const updated = await topicsApi.update(topicId, { ...editTopicForm })
    topics.value = topics.value.map((tp) => (tp.id === topicId ? updated : tp)).sort((a, b) => a.order - b.order)
    editingTopicId.value = null
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  }
}

async function removeTopic(topicId) {
  if (!(await confirm.ask({ message: t('confirm.deleteTopic') }))) return
  try {
    await topicsApi.remove(topicId)
    topics.value = topics.value.filter((tp) => tp.id !== topicId)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  }
}

const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'danger' }

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/bos/courses')">
      <Icon name="chevron-left" size="16" />
      {{ t('courses.title') }}
    </button>

    <Skeleton v-if="loading" class="mt-5 h-40 w-full" />
    <p v-if="errorMessage && !loading" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="course">
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h1 class="text-h1 text-ink">{{ course.title }}</h1>
          <Badge :variant="statusBadge[course.status]">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</Badge>
        </div>
        <!-- Header rather than inside the edit form: the form is collapsed by
             default, and archive/delete shouldn't be reachable only by first
             clicking "edit". -->
        <div class="flex flex-wrap items-center gap-2">
          <AppButton variant="ghost" size="sm" :icon="showEditForm ? 'chevron-up' : 'pencil'" @click="showEditForm = !showEditForm">
            {{ showEditForm ? t('courses.cancel') : t('courses.edit') }}
          </AppButton>
          <AppButton
            v-if="auth.hasPermission('course:create')"
            variant="ghost"
            size="sm"
            icon="copy"
            :loading="duplicating"
            @click="duplicateCourse"
          >
            {{ t('courses.duplicate') }}
          </AppButton>
          <CourseDangerActions :course="course" size="sm" @archived="onCourseArchived" @deleted="onCourseDeleted" />
        </div>
      </div>

      <AppCard v-if="showEditForm" class="mt-6">
        <h2 class="text-h3 text-ink">{{ t('admin.courses.fields.title') }}</h2>
        <form class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="onSave">
          <div class="sm:col-span-2">
            <AppInput v-model="form.title" :label="t('admin.courses.fields.title')" :disabled="!auth.hasPermission('course:update')" />
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.description') }}</label>
            <textarea
              v-model="form.description"
              :disabled="!auth.hasPermission('course:update')"
              rows="3"
              class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            />
          </div>
          <AppSelect
            v-model="form.status"
            :label="t('courses.status.label')"
            :disabled="!auth.hasPermission('course:update')"
            :options="statusOptions.map((o) => ({ value: o.value, label: t(o.label) }))"
          />

          <div class="sm:col-span-2">
            <p class="mb-1.5 text-small font-medium text-ink">{{ t('courses.targeting.rolesLabel') }}</p>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="role in roleList"
                :key="role"
                class="flex items-center gap-2 rounded-md border px-3 py-1.5 text-small transition-default"
                :class="[
                  form.targetRoles.includes(role) ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong text-ink-muted hover:bg-surface-2',
                  auth.hasPermission('course:update') ? 'cursor-pointer' : 'opacity-50',
                ]"
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  :checked="form.targetRoles.includes(role)"
                  :disabled="!auth.hasPermission('course:update')"
                  @change="toggleRole(role)"
                />
                {{ role }}
              </label>
            </div>
          </div>
          <BranchSelect
            v-model="form.branches"
            :options="branchOptions"
            multiple
            allow-create
            :label="t('courses.targeting.branchesLabel')"
            :placeholder="t('courses.targeting.branchesPlaceholder')"
            :disabled="!auth.hasPermission('course:update')"
          />
          <AppInput
            v-model="form.department"
            :label="t('courses.targeting.departmentLabel')"
            :placeholder="t('courses.targeting.departmentPlaceholder')"
            :disabled="!auth.hasPermission('course:update')"
          />
          <p class="sm:col-span-2 -mt-2 text-caption text-ink-faint">{{ t('courses.targeting.noRestrictionHint') }}</p>
          <label v-if="hasTargeting" class="sm:col-span-2 flex items-center gap-2 text-small text-ink">
            <input v-model="form.autoAssign" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" :disabled="!auth.hasPermission('course:update')" />
            {{ t('courses.targeting.autoAssignLabel') }}
          </label>
          <p v-if="hasTargeting" class="sm:col-span-2 -mt-2 text-caption text-ink-faint">{{ t('courses.targeting.autoAssignHint') }}</p>

          <p v-if="errorMessage" class="sm:col-span-2 text-small text-danger">{{ errorMessage }}</p>

          <div v-if="auth.hasPermission('course:update')" class="sm:col-span-2 flex gap-3 pt-1">
            <AppButton type="submit" :loading="saving">{{ saving ? t('courses.saving') : t('courses.save') }}</AppButton>
          </div>
        </form>
      </AppCard>

      <div class="mt-8">
        <div class="flex items-center justify-between">
          <h2 class="text-h3 text-ink">{{ t('courses.topics.title') }}</h2>
          <AppButton v-if="auth.hasPermission('course:update')" variant="outline" size="sm" :icon="showAddTopic ? '' : 'plus'" @click="toggleAddTopic">
            {{ showAddTopic ? t('courses.cancel') : t('courses.topics.add') }}
          </AppButton>
        </div>

        <AppCard v-if="showAddTopic" class="mt-3">
          <form class="grid grid-cols-1 sm:grid-cols-3 gap-3" @submit.prevent="onAddTopicSubmit">
            <div class="sm:col-span-2"><AppInput v-model="addTopicForm.title" required :label="t('admin.courses.fields.title')" /></div>
            <AppInput v-model.number="addTopicForm.order" type="number" :label="t('courses.topics.order')" />
            <div class="col-span-3">
              <AppSelect v-model="addTopicForm.status" :label="t('courses.status.label')" :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }]" />
            </div>
            <p v-if="addTopicError" class="col-span-3 text-small text-danger">{{ addTopicError }}</p>
            <div class="col-span-3">
              <AppButton type="submit" :loading="addTopicSubmitting">{{ addTopicSubmitting ? t('courses.creating') : t('courses.create') }}</AppButton>
            </div>
          </form>
        </AppCard>

        <div class="mt-4 space-y-3">
          <AppCard v-for="topic in topics" :key="topic.id">
            <template v-if="editingTopicId === topic.id">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="sm:col-span-2"><AppInput v-model="editTopicForm.title" :label="t('admin.courses.fields.title')" /></div>
                <AppInput v-model.number="editTopicForm.order" type="number" :label="t('courses.topics.order')" />
                <div class="col-span-3">
                  <AppSelect v-model="editTopicForm.status" :label="t('courses.status.label')" :options="[{ value: 'DRAFT', label: t('courses.status.draft') }, { value: 'PUBLISHED', label: t('courses.status.published') }]" />
                </div>
                <div class="col-span-3 flex gap-2">
                  <AppButton size="sm" @click="saveTopicEdit(topic.id)">{{ t('courses.save') }}</AppButton>
                  <AppButton size="sm" variant="ghost" @click="editingTopicId = null">{{ t('courses.cancel') }}</AppButton>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-small font-semibold text-ink">{{ topic.order }}. {{ topic.title }}</p>
                  <Badge :variant="statusBadge[topic.status]" size="sm" class="mt-1">{{ topic.status }}</Badge>
                </div>
                <div class="flex items-center gap-1">
                  <AppButton variant="ghost" size="sm" :icon="expandedVideosTopicId === topic.id ? 'chevron-up' : 'layers'" @click="expandedVideosTopicId = expandedVideosTopicId === topic.id ? null : topic.id">
                    {{ expandedVideosTopicId === topic.id ? t('content.hide') : t('content.manage') }}
                  </AppButton>
                  <template v-if="auth.hasPermission('course:update')">
                    <AppButton variant="ghost" size="sm" icon="pencil" @click="startEditTopic(topic)" />
                    <AppButton v-if="auth.hasPermission('course:delete')" variant="ghost" size="sm" icon="trash" @click="removeTopic(topic.id)" />
                  </template>
                </div>
              </div>
              <TopicContentPanel v-if="expandedVideosTopicId === topic.id" :topic-id="topic.id" />
            </template>
          </AppCard>

          <EmptyState v-if="topics.length === 0" icon="layers" :title="t('courses.topics.empty')" />
        </div>
      </div>

      <div v-if="auth.hasPermission('course:assign')" class="mt-8">
        <h2 class="mb-3 text-h3 text-ink">{{ t('courses.access.assign') }}</h2>
        <AssignCoursePanel :course-id="course.id" />
      </div>

      <!-- Anything left untouched here keeps following the global policy in
           Settings, so a course only stores what it genuinely differs on. -->
      <div class="mt-8">
        <h2 class="mb-1 text-h3 text-ink">{{ t('attention.admin.title') }}</h2>
        <p class="mb-3 text-caption text-ink-faint">{{ t('attention.admin.courseHint') }}</p>
        <AppCard>
          <AttentionPolicyForm :course-id="course.id" :readonly="!auth.hasPermission('course:update')" />
        </AppCard>
      </div>
    </template>
  </div>
</template>
