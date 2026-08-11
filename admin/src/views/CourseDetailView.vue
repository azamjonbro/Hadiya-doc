<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { coursesApi } from '@/services/courses'
import { topicsApi } from '@/services/topics'
import TopicVideosPanel from '@/components/TopicVideosPanel.vue'

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
    topics.value = topics.value.map((t) => (t.id === topicId ? updated : t)).sort((a, b) => a.order - b.order)
    editingTopicId.value = null
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

async function removeTopic(topicId) {
  try {
    await topicsApi.remove(topicId)
    topics.value = topics.value.filter((t) => t.id !== topicId)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <button type="button" class="text-sm text-slate-500 dark:text-slate-400" @click="router.push('/admin/courses')">
      ← {{ t('courses.title') }}
    </button>

    <p v-if="loading" class="mt-6 text-sm text-slate-500 dark:text-slate-400">{{ t('courses.loading') }}</p>

    <template v-else-if="course">
      <h1 class="mt-4 text-xl font-semibold tracking-tight">{{ course.title }}</h1>

      <form class="mt-6 grid grid-cols-2 gap-3" @submit.prevent="onSave">
        <label class="col-span-2 text-sm font-medium">
          {{ t('courses.fields.title') }}
          <input v-model="form.title" :disabled="!auth.hasPermission('course:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700" />
        </label>
        <label class="col-span-2 text-sm font-medium">
          {{ t('courses.fields.description') }}
          <textarea v-model="form.description" :disabled="!auth.hasPermission('course:update')" rows="3" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"></textarea>
        </label>
        <label class="text-sm font-medium">
          {{ t('courses.status.label') }}
          <select v-model="form.status" :disabled="!auth.hasPermission('course:update')" class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700">
            <option value="DRAFT">{{ t('courses.status.draft') }}</option>
            <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
            <option value="ARCHIVED">{{ t('courses.status.archived') }}</option>
          </select>
        </label>

        <p v-if="errorMessage" class="col-span-2 text-sm text-red-500">{{ errorMessage }}</p>

        <div v-if="auth.hasPermission('course:update')" class="col-span-2 flex gap-3">
          <button type="submit" :disabled="saving" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
            {{ saving ? t('courses.saving') : t('courses.save') }}
          </button>
          <button
            v-if="auth.hasPermission('course:delete')"
            type="button"
            class="rounded-md border border-red-400 px-4 py-2 text-sm font-medium text-red-500"
            @click="onArchive"
          >
            {{ t('courses.archive') }}
          </button>
        </div>
      </form>

      <div class="mt-10">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold tracking-tight">{{ t('courses.topics.title') }}</h2>
          <button
            v-if="auth.hasPermission('course:update')"
            type="button"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            @click="showAddTopic = !showAddTopic"
          >
            {{ showAddTopic ? t('courses.cancel') : t('courses.topics.add') }}
          </button>
        </div>

        <form v-if="showAddTopic" class="mt-3 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800" @submit.prevent="onAddTopicSubmit">
          <input v-model="addTopicForm.title" required :placeholder="t('courses.fields.title')" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
          <input v-model.number="addTopicForm.order" type="number" :placeholder="t('courses.topics.order')" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
          <select v-model="addTopicForm.status" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
            <option value="DRAFT">{{ t('courses.status.draft') }}</option>
            <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
          </select>
          <p v-if="addTopicError" class="col-span-3 text-sm text-red-500">{{ addTopicError }}</p>
          <button type="submit" :disabled="addTopicSubmitting" class="col-span-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
            {{ addTopicSubmitting ? t('courses.creating') : t('courses.create') }}
          </button>
        </form>

        <ul class="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <li v-for="topic in topics" :key="topic.id" class="p-4">
            <template v-if="editingTopicId === topic.id">
              <div class="grid grid-cols-3 gap-3">
                <input v-model="editTopicForm.title" class="col-span-2 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
                <input v-model.number="editTopicForm.order" type="number" class="rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
                <select v-model="editTopicForm.status" class="col-span-3 rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
                  <option value="DRAFT">{{ t('courses.status.draft') }}</option>
                  <option value="PUBLISHED">{{ t('courses.status.published') }}</option>
                </select>
                <div class="col-span-3 flex gap-2">
                  <button type="button" class="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-slate-900" @click="saveTopicEdit(topic.id)">
                    {{ t('courses.save') }}
                  </button>
                  <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" @click="editingTopicId = null">
                    {{ t('courses.cancel') }}
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">{{ topic.order }}. {{ topic.title }}</p>
                  <p class="text-sm text-slate-500 dark:text-slate-400">{{ topic.status }}</p>
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="text-sm underline"
                    @click="expandedVideosTopicId = expandedVideosTopicId === topic.id ? null : topic.id"
                  >
                    {{ expandedVideosTopicId === topic.id ? t('videos.hide') : t('videos.manage') }}
                  </button>
                  <template v-if="auth.hasPermission('course:update')">
                    <button type="button" class="text-sm underline" @click="startEditTopic(topic)">{{ t('courses.topics.edit') }}</button>
                    <button
                      v-if="auth.hasPermission('course:delete')"
                      type="button"
                      class="text-sm text-red-500 underline"
                      @click="removeTopic(topic.id)"
                    >
                      {{ t('courses.topics.remove') }}
                    </button>
                  </template>
                </div>
              </div>
              <TopicVideosPanel v-if="expandedVideosTopicId === topic.id" :topic-id="topic.id" />
            </template>
          </li>
          <li v-if="topics.length === 0" class="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {{ t('courses.topics.empty') }}
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
