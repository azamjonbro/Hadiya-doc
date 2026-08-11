<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import { topicsApi } from '@/services/topics'
import TopicVideosPanel from '@/components/TopicVideosPanel.vue'
import AssignCoursePanel from '@/components/AssignCoursePanel.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const course = ref(null)
const topics = ref([])
const expandedVideosTopicId = ref(null)

const form = reactive({ title: '', description: '', status: 'DRAFT' })

const showAddTopic = ref(false)
const addTopicSubmitting = ref(false)
const addTopicError = ref('')
const addTopicForm = reactive({ title: '', order: 0, status: 'DRAFT' })

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
    topics.value = await coursesApi.listTopics(route.params.id)
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
    course.value = await coursesApi.update(route.params.id, { ...form })
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function onArchive() {
  try {
    course.value = await coursesApi.archive(route.params.id)
    form.status = course.value.status
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

async function onAddTopicSubmit() {
  addTopicSubmitting.value = true
  addTopicError.value = ''
  try {
    const topic = await coursesApi.createTopic(route.params.id, { ...addTopicForm })
    topics.value = [...topics.value, topic].sort((a, b) => a.order - b.order)
    showAddTopic.value = false
    Object.assign(addTopicForm, { title: '', order: 0, status: 'DRAFT' })
  } catch (error) {
    addTopicError.value = error.response?.data?.message ?? String(error)
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
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

async function removeTopic(topicId) {
  try {
    await topicsApi.remove(topicId)
    topics.value = topics.value.filter((tp) => tp.id !== topicId)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'danger' }

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/admin/courses')">
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
      </div>

      <AppCard class="mt-6">
        <h2 class="text-h3 text-ink">{{ t('courses.fields.title') }}</h2>
        <form class="mt-4 grid grid-cols-2 gap-4" @submit.prevent="onSave">
          <div class="col-span-2">
            <AppInput v-model="form.title" :label="t('courses.fields.title')" :disabled="!auth.hasPermission('course:update')" />
          </div>
          <div class="col-span-2">
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

          <p v-if="errorMessage" class="col-span-2 text-small text-danger">{{ errorMessage }}</p>

          <div v-if="auth.hasPermission('course:update')" class="col-span-2 flex gap-3 pt-1">
            <AppButton type="submit" :loading="saving">{{ saving ? t('courses.saving') : t('courses.save') }}</AppButton>
            <AppButton v-if="auth.hasPermission('course:delete')" type="button" variant="danger" @click="onArchive">{{ t('courses.archive') }}</AppButton>
          </div>
        </form>
      </AppCard>

      <div class="mt-8">
        <div class="flex items-center justify-between">
          <h2 class="text-h3 text-ink">{{ t('courses.topics.title') }}</h2>
          <AppButton v-if="auth.hasPermission('course:update')" variant="outline" size="sm" :icon="showAddTopic ? '' : 'plus'" @click="showAddTopic = !showAddTopic">
            {{ showAddTopic ? t('courses.cancel') : t('courses.topics.add') }}
          </AppButton>
        </div>

        <AppCard v-if="showAddTopic" class="mt-3">
          <form class="grid grid-cols-3 gap-3" @submit.prevent="onAddTopicSubmit">
            <div class="col-span-2"><AppInput v-model="addTopicForm.title" required :label="t('courses.fields.title')" /></div>
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
              <div class="grid grid-cols-3 gap-3">
                <div class="col-span-2"><AppInput v-model="editTopicForm.title" :label="t('courses.fields.title')" /></div>
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
                  <AppButton variant="ghost" size="sm" :icon="expandedVideosTopicId === topic.id ? 'chevron-up' : 'video'" @click="expandedVideosTopicId = expandedVideosTopicId === topic.id ? null : topic.id">
                    {{ expandedVideosTopicId === topic.id ? t('videos.hide') : t('videos.manage') }}
                  </AppButton>
                  <template v-if="auth.hasPermission('course:update')">
                    <AppButton variant="ghost" size="sm" icon="pencil" @click="startEditTopic(topic)" />
                    <AppButton v-if="auth.hasPermission('course:delete')" variant="ghost" size="sm" icon="trash" @click="removeTopic(topic.id)" />
                  </template>
                </div>
              </div>
              <TopicVideosPanel v-if="expandedVideosTopicId === topic.id" :topic-id="topic.id" />
            </template>
          </AppCard>

          <EmptyState v-if="topics.length === 0" icon="layers" :title="t('courses.topics.empty')" />
        </div>
      </div>

      <div v-if="auth.hasPermission('course:assign')" class="mt-8">
        <h2 class="mb-3 text-h3 text-ink">{{ t('courses.access.assign') }}</h2>
        <AssignCoursePanel :course-id="course.id" />
      </div>
    </template>
  </div>
</template>
