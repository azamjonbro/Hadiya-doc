<script setup>
/**
 * Building a path: the steps, the rules, and who is on it.
 *
 * Ordering is drag-free on purpose — the arrows are unambiguous, work on a
 * phone, and there are rarely more than a dozen steps. The `order` field is
 * rewritten from the array position on save, so what the administrator sees
 * is what the server sequences by.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { pathsApi } from '@/services/paths'
import { coursesApi } from '@/services/courses'
import { certificatesApi } from '@/services/certificates'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const KINDS = ['GENERAL', 'ONBOARDING', 'CERTIFICATION', 'DEVELOPMENT']

const path = ref(null)
const loading = ref(true)
const saving = ref(false)
const tab = ref('steps')

const courses = ref([])
const templates = ref([])
const branchOptions = ref([])
const enrollments = ref([])
const loadingEnrollments = ref(false)

const pickerOpen = ref(false)
const pickerSelection = ref(new Set())

const courseById = computed(() => new Map(courses.value.map((course) => [course.id, course])))

const tabs = computed(() => [
  { value: 'steps', label: t('pathBuilder.tabs.steps'), count: path.value?.items?.length ?? 0 },
  { value: 'settings', label: t('pathBuilder.tabs.settings') },
  { value: 'people', label: t('pathBuilder.tabs.people') },
])

async function load() {
  loading.value = true
  try {
    path.value = await pathsApi.getById(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loading.value = false
  }
}

async function loadEnrollments() {
  loadingEnrollments.value = true
  try {
    enrollments.value = await pathsApi.enrollments(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.loadError')))
  } finally {
    loadingEnrollments.value = false
  }
}

function switchTab(value) {
  tab.value = value
  if (value === 'people' && !enrollments.value.length) loadEnrollments()
}

async function save() {
  saving.value = true
  try {
    await pathsApi.update(route.params.id, {
      title: path.value.title,
      description: path.value.description,
      kind: path.value.kind,
      status: path.value.status,
      sequential: path.value.sequential,
      targetRoles: path.value.targetRoles,
      branches: path.value.branches,
      department: path.value.department,
      certificateTemplateId: path.value.certificateTemplateId || null,
      validityDays: Number(path.value.validityDays) || 0,
      // Rewritten from the array position, so the order shown is the order
      // sequenced. Sending the old `order` values would leave the server
      // ordering by numbers the screen no longer reflects.
      items: path.value.items.map((item, index) => ({
        type: item.type,
        refId: item.refId,
        order: index,
        required: item.required,
        prerequisiteIds: item.prerequisiteIds ?? [],
      })),
    })
    toast.success(t('pathBuilder.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('paths.saveError')))
  } finally {
    saving.value = false
  }
}

async function openPicker() {
  pickerOpen.value = true
  pickerSelection.value = new Set()
  if (!courses.value.length) {
    const result = await coursesApi.list({ limit: 100, status: 'PUBLISHED' })
    courses.value = result.items
  }
}

function togglePick(id) {
  const next = new Set(pickerSelection.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  pickerSelection.value = next
}

function addPicked() {
  for (const id of pickerSelection.value) {
    const course = courseById.value.get(id)
    path.value.items.push({
      id: `new-${id}`,
      type: 'COURSE',
      refId: id,
      order: path.value.items.length,
      required: true,
      prerequisiteIds: [],
      title: course?.title ?? '',
      estimatedMinutes: course?.estimatedMinutes ?? 0,
    })
  }
  pickerOpen.value = false
}

function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= path.value.items.length) return
  const [item] = path.value.items.splice(index, 1)
  path.value.items.splice(target, 0, item)
}

const availableCourses = computed(() => {
  const used = new Set(path.value?.items?.map((item) => item.refId) ?? [])
  return courses.value.filter((course) => !used.has(course.id))
})

const statusVariant = { ACTIVE: 'info', COMPLETED: 'success', CANCELLED: 'neutral', EXPIRED: 'warning' }

onMounted(async () => {
  await load()
  const [courseResult] = await Promise.all([
    coursesApi.list({ limit: 100 }).catch(() => ({ items: [] })),
    certificatesApi
      .templates()
      .then((rows) => {
        templates.value = rows
      })
      .catch(() => {
        templates.value = []
      }),
    usersApi
      .branches()
      .then((names) => {
        branchOptions.value = names
      })
      .catch(() => {
        branchOptions.value = []
      }),
  ])
  courses.value = courseResult.items
})
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small text-ink-muted hover:text-ink" @click="router.push('/bos/paths')">
      <Icon name="chevron-left" size="16" />
      {{ t('paths.adminTitle') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
    </div>

    <template v-else-if="path">
      <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-h1 text-ink">{{ path.title }}</h1>
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge :variant="path.status === 'PUBLISHED' ? 'success' : 'neutral'" size="sm">
              {{ t(`paths.status.${path.status}`) }}
            </Badge>
            <Badge variant="neutral" size="sm">{{ t(`paths.kind.${path.kind}`) }}</Badge>
          </div>
        </div>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </div>

      <Tabs :model-value="tab" :tabs="tabs" class="mt-6" @update:model-value="switchTab" />

      <!-- Steps -->
      <div v-if="tab === 'steps'" class="mt-6">
        <AppCard class="p-4">
          <div class="flex items-center justify-between">
            <p class="text-small font-medium text-ink">{{ t('pathBuilder.steps') }}</p>
            <AppButton size="sm" icon="plus" @click="openPicker">{{ t('pathBuilder.addCourses') }}</AppButton>
          </div>
          <p class="mt-1 text-caption text-ink-faint">
            {{ path.sequential ? t('pathBuilder.sequentialHint') : t('pathBuilder.freeHint') }}
          </p>

          <EmptyState
            v-if="!path.items.length"
            class="py-8"
            icon="layers"
            :title="t('pathBuilder.noSteps')"
            :description="t('pathBuilder.noStepsHint')"
          />
          <div v-else class="mt-3 space-y-1.5">
            <div
              v-for="(item, index) in path.items"
              :key="item.id"
              class="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              :class="item.missing ? 'border-danger/40 bg-danger-subtle/30' : ''"
            >
              <span class="w-5 shrink-0 text-caption text-ink-faint">{{ index + 1 }}.</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-small text-ink">{{ item.title ?? t('paths.missingCourse') }}</p>
                <p v-if="item.missing" class="text-caption text-danger">{{ t('paths.missingHint') }}</p>
              </div>
              <label class="flex shrink-0 items-center gap-1.5 text-caption text-ink-muted">
                <input v-model="item.required" type="checkbox" class="h-3.5 w-3.5 rounded border-border-strong" />
                {{ t('common.required') }}
              </label>
              <div class="flex shrink-0 gap-1">
                <AppButton variant="ghost" size="sm" icon="chevron-up" @click="move(index, -1)" />
                <AppButton variant="ghost" size="sm" icon="chevron-down" @click="move(index, 1)" />
                <AppButton variant="ghost" size="sm" icon="trash" @click="path.items.splice(index, 1)" />
              </div>
            </div>
          </div>
        </AppCard>
      </div>

      <!-- Settings -->
      <div v-else-if="tab === 'settings'" class="mt-6 space-y-4">
        <AppCard class="space-y-4 p-4">
          <AppInput v-model="path.title" :label="t('pathBuilder.pathTitle')" />
          <div>
            <label class="mb-1.5 block text-small font-medium text-ink">{{ t('pathBuilder.description') }}</label>
            <textarea
              v-model="path.description"
              rows="3"
              class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <AppSelect
              v-model="path.kind"
              :label="t('pathBuilder.kind')"
              :options="KINDS.map((value) => ({ value, label: t(`paths.kind.${value}`) }))"
            />
            <AppSelect
              v-model="path.status"
              :label="t('pathBuilder.status')"
              :options="['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((value) => ({ value, label: t(`paths.status.${value}`) }))"
            />
          </div>
          <label class="flex items-center gap-2 text-small text-ink">
            <input v-model="path.sequential" type="checkbox" class="h-4 w-4 rounded border-border-strong" />
            {{ t('pathBuilder.sequential') }}
          </label>
          <p class="text-caption text-ink-faint">{{ t('pathBuilder.sequentialExplain') }}</p>
        </AppCard>

        <AppCard class="space-y-4 p-4">
          <p class="text-small font-medium text-ink">{{ t('pathBuilder.audience') }}</p>
          <AppInput v-model="path.department" :label="t('courses.targeting.departmentLabel')" />
          <p class="text-caption text-ink-faint">{{ t('courses.targeting.noRestrictionHint') }}</p>
        </AppCard>

        <AppCard class="space-y-4 p-4">
          <p class="text-small font-medium text-ink">{{ t('pathBuilder.certificate') }}</p>
          <AppSelect
            v-if="templates.length"
            v-model="path.certificateTemplateId"
            :label="t('courses.fields.certificateTemplate')"
            :placeholder="t('courses.fields.noCertificate')"
            :options="templates.map((template) => ({ value: template._id, label: template.name }))"
          />
          <AppInput
            v-model="path.validityDays"
            type="number"
            :label="t('courses.fields.validityDays')"
            :hint="t('courses.fields.validityDaysHint')"
          />
        </AppCard>
      </div>

      <!-- People -->
      <div v-else class="mt-6">
        <div v-if="loadingEnrollments" class="space-y-2">
          <Skeleton v-for="n in 4" :key="n" class="h-12 w-full rounded-lg" />
        </div>
        <EmptyState
          v-else-if="!enrollments.length"
          icon="users"
          :title="t('pathBuilder.nobody')"
          :description="t('pathBuilder.nobodyHint')"
        />
        <AppCard v-else class="overflow-x-auto p-0">
          <table class="w-full text-small">
            <thead class="border-b border-border text-left text-ink-muted">
              <tr>
                <th class="px-4 py-3 font-medium">{{ t('pathBuilder.person') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('pathBuilder.department') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('pathBuilder.progressColumn') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('pathBuilder.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in enrollments" :key="row.userId" class="border-b border-border last:border-0">
                <td class="px-4 py-3 text-ink">{{ row.fullName }}</td>
                <td class="px-4 py-3 text-ink-muted">{{ row.department || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <ProgressBar class="w-24" size="sm" :value="row.completionPercent" />
                    <span class="text-caption text-ink-faint">{{ row.completionPercent }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <Badge :variant="statusVariant[row.status]" size="sm">{{ t(`pathBuilder.enrollment.${row.status}`) }}</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </AppCard>
      </div>
    </template>

    <!-- Course picker -->
    <Modal v-model="pickerOpen" :title="t('pathBuilder.addCourses')" size="lg">
      <EmptyState
        v-if="!availableCourses.length"
        class="py-6"
        icon="book-open"
        :title="t('pathBuilder.pickerEmpty')"
        :description="t('pathBuilder.pickerEmptyHint')"
      />
      <div v-else class="max-h-80 space-y-1 overflow-y-auto">
        <button
          v-for="course in availableCourses"
          :key="course.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-default"
          :class="pickerSelection.has(course.id) ? 'bg-primary-subtle' : 'hover:bg-surface-hover'"
          @click="togglePick(course.id)"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
            :class="pickerSelection.has(course.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong'"
          >
            <Icon v-if="pickerSelection.has(course.id)" name="check" size="11" />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-small text-ink">{{ course.title }}</span>
            <span class="block text-caption text-ink-faint">{{ t(`courses.status.${course.status.toLowerCase()}`) }}</span>
          </span>
        </button>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="pickerOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!pickerSelection.size" @click="addPicked">
          {{ t('pathBuilder.addSelected', { count: pickerSelection.size }) }}
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
