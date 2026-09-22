<script setup>
/**
 * Bring an existing course into this project. The library has courses
 * from before projects existed and courses another team filed elsewhere;
 * either is moved here by setting its `projectId`, which changes nothing
 * about who learns from it — a folder is only a folder.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { useProjectsStore } from '@/stores/projects'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue', 'filed'])
const { t } = useI18n()
const toast = useToast()
const projectsStore = useProjectsStore()

const search = ref('')
const items = ref([])
const loading = ref(false)
const picked = ref('')
const submitting = ref(false)

const rows = computed(() => items.value.filter((course) => course.projectId !== props.project.id))
const projectName = (id) => projectsStore.items.find((p) => p.id === id)?.name ?? ''
const statusBadge = { DRAFT: 'neutral', PUBLISHED: 'success', ARCHIVED: 'danger' }

let debounce = null
let latest = 0
async function load() {
  const ticket = (latest += 1)
  loading.value = true
  try {
    const result = await coursesApi.list({ page: 1, limit: 50, ...(search.value ? { search: search.value } : {}) })
    if (ticket === latest) items.value = result.items
  } catch (error) {
    if (ticket === latest) toast.error(apiErrorText(error))
  } finally {
    if (ticket === latest) loading.value = false
  }
}
function onSearch(value) {
  search.value = value
  clearTimeout(debounce)
  debounce = setTimeout(load, 250)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    picked.value = ''
    search.value = ''
    load()
  },
  { immediate: true },
)

async function submit() {
  const course = rows.value.find((c) => c.id === picked.value)
  if (!course) return
  submitting.value = true
  try {
    const updated = await coursesApi.update(course.id, { projectId: props.project.id })
    if (course.projectId) projectsStore.bump(course.projectId, -1)
    emit('filed', updated)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="t('projects.file.title')" :description="t('projects.file.hint', { name: project.name })" size="lg" @update:model-value="$emit('update:modelValue', $event)">
    <AppInput :model-value="search" icon="search" :placeholder="t('courses.filters.search')" @update:model-value="onSearch" />

    <div v-if="loading && !items.length" class="mt-3 space-y-2">
      <Skeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
    </div>
    <ul v-else-if="rows.length" class="mt-3 max-h-[46vh] divide-y divide-border overflow-y-auto">
      <li v-for="course in rows" :key="course.id">
        <label class="flex cursor-pointer items-center gap-3 px-1 py-3 transition-default hover:bg-surface-2">
          <input v-model="picked" type="radio" name="file-course" :value="course.id" class="h-4 w-4 border-border-strong" />
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"><Icon name="layers" size="18" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] text-ink">{{ course.title }}</span>
            <span class="block truncate text-[13px] text-ink-muted">
              {{ course.projectId ? t('projects.file.inProject', { name: projectName(course.projectId) || '…' }) : t('projects.file.unfiled') }}
            </span>
          </span>
          <Badge v-if="course.status !== 'PUBLISHED'" :variant="statusBadge[course.status]" size="sm">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</Badge>
        </label>
      </li>
    </ul>
    <p v-else class="mt-6 text-center text-small text-ink-muted">{{ t('courses.empty') }}</p>

    <template #footer>
      <AppButton variant="secondary" @click="$emit('update:modelValue', false)">{{ t('common.cancel') }}</AppButton>
      <AppButton :disabled="!picked" :loading="submitting" @click="submit">{{ t('projects.file.confirm') }}</AppButton>
    </template>
  </Modal>
</template>
