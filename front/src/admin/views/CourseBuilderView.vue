<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { coursesApi } from '@/services/courses'
import { certificatesApi } from '@/services/certificates'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const roleList = Object.values(ROLES)

const steps = [
  { key: 'basics', labelKey: 'courseBuilder.steps.basics', icon: 'file-text' },
  { key: 'details', labelKey: 'courseBuilder.steps.details', icon: 'list' },
  { key: 'media', labelKey: 'courseBuilder.steps.media', icon: 'layers' },
  { key: 'access', labelKey: 'courseBuilder.steps.access', icon: 'shield' },
  { key: 'review', labelKey: 'courseBuilder.steps.review', icon: 'check-circle' },
]
const stepIndex = ref(0)

const form = reactive({
  title: '',
  description: '',
  cover: '',
  banner: '',
  status: 'DRAFT',
  targetRoles: [],
  department: '',
  autoAssign: false,
  // Catalog metadata (3.4). The defaults match the model's, so a course
  // created without touching this step behaves exactly as courses did
  // before the step existed.
  categoryId: '',
  level: 'BEGINNER',
  tags: [],
  estimatedMinutes: 0,
  navigationMode: 'SEQUENTIAL',
  validityDays: 0,
  allowSelfEnroll: false,
  certificateTemplateId: '',
  completionRule: { minPercent: 100, requireAllRequired: true },
})

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']
const categories = ref([])
const templates = ref([])
const tagInput = ref('')

coursesApi
  .categories()
  .then((rows) => {
    categories.value = rows
  })
  .catch(() => {
    categories.value = []
  })
// Only the people who manage templates can list them. A course author
// without that permission simply gets no certificate picker rather than an
// error on a page that is otherwise working.
certificatesApi
  .templates()
  .then((rows) => {
    templates.value = rows
  })
  .catch(() => {
    templates.value = []
  })

function addTag() {
  const value = tagInput.value.trim()
  if (!value || form.tags.includes(value) || form.tags.length >= 20) {
    tagInput.value = ''
    return
  }
  form.tags.push(value)
  tagInput.value = ''
}

function removeTag(tag) {
  form.tags.splice(form.tags.indexOf(tag), 1)
}
const submitting = ref(false)
const errorMessage = ref('')

function toggleRole(role) {
  const idx = form.targetRoles.indexOf(role)
  if (idx === -1) form.targetRoles.push(role)
  else form.targetRoles.splice(idx, 1)
}

const hasTargeting = computed(() => form.targetRoles.length > 0 || form.department.trim().length > 0)

const canProceed = computed(() => {
  if (stepIndex.value === 0) return form.title.trim().length > 0
  return true
})

function next() {
  if (stepIndex.value < steps.length - 1 && canProceed.value) stepIndex.value += 1
}
function back() {
  if (stepIndex.value > 0) stepIndex.value -= 1
}

async function onPublish(status) {
  submitting.value = true
  errorMessage.value = ''
  try {
    // Empty strings are the select's "not chosen", which the API reads as
    // an invalid id rather than as null. Converted here so an untouched
    // picker means "no category" instead of a validation error.
    const course = await coursesApi.create({
      ...form,
      status,
      categoryId: form.categoryId || null,
      certificateTemplateId: form.certificateTemplateId || null,
      estimatedMinutes: Number(form.estimatedMinutes) || 0,
      validityDays: Number(form.validityDays) || 0,
      completionRule: {
        minPercent: Number(form.completionRule.minPercent) || 100,
        requireAllRequired: form.completionRule.requireAllRequired,
      },
    })
    toast.success(t('courseBuilder.created'))
    router.push(`/bos/courses/${course.id}`)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/bos/courses')">
      <Icon name="chevron-left" size="16" />
      {{ t('courses.title') }}
    </button>

    <h1 class="mt-4 text-[24px] font-semibold text-ink">{{ t('courseBuilder.title') }}</h1>

    <!-- Stepper -->
    <div class="mt-6 flex items-center">
      <template v-for="(step, i) in steps" :key="step.key">
        <div class="flex items-center gap-2.5">
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-small font-semibold transition-default"
            :class="i < stepIndex ? 'bg-primary text-primary-foreground' : i === stepIndex ? 'bg-primary-subtle text-primary ring-2 ring-primary' : 'bg-surface-2 text-ink-faint'"
          >
            <Icon v-if="i < stepIndex" name="check" size="14" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="hidden text-small font-medium sm:inline" :class="i <= stepIndex ? 'text-ink' : 'text-ink-faint'">{{ t(step.labelKey) }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="mx-3 h-px flex-1" :class="i < stepIndex ? 'bg-primary' : 'bg-border'" />
      </template>
    </div>

    <AppCard class="mt-6">
      <!-- Step 1: Basics -->
      <div v-if="stepIndex === 0" class="space-y-4">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.basics') }}</h2>
        <AppInput v-model="form.title" required :label="t('admin.courses.fields.title')" />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.description') }}</label>
          <textarea
            v-model="form.description"
            rows="4"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <!-- Step 2: Details -->
      <div v-else-if="stepIndex === 1" class="space-y-4">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.details') }}</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <AppSelect
            v-model="form.categoryId"
            :label="t('courses.fields.category')"
            :placeholder="t('courses.filters.allCategories')"
            :options="categories.map((category) => ({ value: category.id, label: category.name }))"
          />
          <AppSelect
            v-model="form.level"
            :label="t('courses.fields.level')"
            :options="LEVELS.map((level) => ({ value: level, label: t(`courses.level.${level}`) }))"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.tags') }}</label>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in form.tags"
              :key="tag"
              class="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-caption text-ink"
            >
              {{ tag }}
              <button type="button" class="text-ink-faint hover:text-danger" @click="removeTag(tag)">
                <Icon name="close" size="12" />
              </button>
            </span>
          </div>
          <AppInput
            v-model="tagInput"
            class="mt-2"
            :placeholder="t('courses.fields.tagPlaceholder')"
            @keyup.enter="addTag"
            @blur="addTag"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <AppInput
            v-model="form.estimatedMinutes"
            type="number"
            :label="t('courses.fields.estimatedMinutes')"
            :hint="t('courses.fields.estimatedMinutesHint')"
          />
          <AppInput
            v-model="form.validityDays"
            type="number"
            :label="t('courses.fields.validityDays')"
            :hint="t('courses.fields.validityDaysHint')"
          />
        </div>

        <AppSelect
          v-model="form.navigationMode"
          :label="t('courses.fields.navigationMode')"
          :options="[
            { value: 'SEQUENTIAL', label: t('courses.navigation.SEQUENTIAL') },
            { value: 'FREE', label: t('courses.navigation.FREE') },
          ]"
        />

        <AppSelect
          v-if="templates.length"
          v-model="form.certificateTemplateId"
          :label="t('courses.fields.certificateTemplate')"
          :placeholder="t('courses.fields.noCertificate')"
          :options="templates.map((template) => ({ value: template._id, label: template.name }))"
        />

        <div class="rounded-lg border border-border p-4">
          <p class="text-small font-medium text-ink">{{ t('courses.fields.completionRule') }}</p>
          <p class="mt-1 text-caption text-ink-faint">{{ t('courses.fields.completionRuleHint') }}</p>
          <div class="mt-3 grid gap-4 sm:grid-cols-2">
            <AppInput v-model="form.completionRule.minPercent" type="number" :label="t('courses.fields.minPercent')" />
            <label class="flex items-end gap-2 pb-2 text-small text-ink">
              <input
                v-model="form.completionRule.requireAllRequired"
                type="checkbox"
                class="h-4 w-4 rounded border-border-strong text-primary"
              />
              {{ t('courses.fields.requireAllRequired') }}
            </label>
          </div>
        </div>

        <label class="flex items-center gap-2 text-small text-ink">
          <input v-model="form.allowSelfEnroll" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
          {{ t('courses.fields.allowSelfEnroll') }}
        </label>
      </div>

      <!-- Step 3: Media -->
      <div v-else-if="stepIndex === 2" class="space-y-4">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.media') }}</h2>
        <ImageUploadField v-model="form.cover" :label="t('courseBuilder.coverUrl')" aspect="aspect-video" />
        <ImageUploadField v-model="form.banner" :label="t('courseBuilder.bannerUrl')" aspect="aspect-[3/1]" />
        <p class="text-caption text-ink-faint">{{ t('courseBuilder.mediaHint') }}</p>
      </div>

      <!-- Step 4: Access -->
      <div v-else-if="stepIndex === 3" class="space-y-4">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.access') }}</h2>
        <div>
          <p class="mb-1.5 text-small font-medium text-ink">{{ t('courses.targeting.rolesLabel') }}</p>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="role in roleList"
              :key="role"
              class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-small transition-default"
              :class="form.targetRoles.includes(role) ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong text-ink-muted hover:bg-surface-2'"
            >
              <input type="checkbox" class="sr-only" :checked="form.targetRoles.includes(role)" @change="toggleRole(role)" />
              {{ role }}
            </label>
          </div>
        </div>
        <AppInput v-model="form.department" :label="t('courses.targeting.departmentLabel')" :placeholder="t('courses.targeting.departmentPlaceholder')" />
        <p class="text-caption text-ink-faint">{{ t('courses.targeting.noRestrictionHint') }}</p>
      </div>

      <!-- Step 5: Review -->
      <div v-else class="space-y-5">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.review') }}</h2>
        <div class="rounded-lg border border-border bg-surface-2 p-4">
          <p class="text-small font-semibold text-ink">{{ form.title || '—' }}</p>
          <p v-if="form.description" class="mt-1 text-small text-ink-muted">{{ form.description }}</p>
          <p v-if="!form.cover" class="mt-2 text-caption text-ink-faint">{{ t('courseBuilder.noCover') }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral" size="sm">{{ t(`courses.level.${form.level}`) }}</Badge>
            <Badge v-if="form.estimatedMinutes" variant="neutral" size="sm">
              {{ t('courses.minutes', { count: form.estimatedMinutes }) }}
            </Badge>
            <Badge v-for="tag in form.tags" :key="tag" variant="neutral" size="sm">{{ tag }}</Badge>
            <Badge v-if="form.certificateTemplateId" variant="success" size="sm">
              {{ t('courses.fields.issuesCertificate') }}
            </Badge>
          </div>
          <div v-if="hasTargeting" class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <Badge v-for="role in form.targetRoles" :key="role" variant="primary" size="sm">{{ role }}</Badge>
            <Badge v-if="form.department" variant="info" size="sm">{{ form.department }}</Badge>
          </div>
          <p v-else class="mt-3 text-caption text-ink-faint">{{ t('courses.targeting.noRestrictionHint') }}</p>
        </div>
        <label v-if="hasTargeting" class="flex items-center gap-2 text-small text-ink">
          <input v-model="form.autoAssign" type="checkbox" class="h-4 w-4 rounded border-border-strong text-primary" />
          {{ t('courses.targeting.autoAssignLabel') }}
        </label>
        <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <AppButton :loading="submitting" @click="onPublish('PUBLISHED')">
            <Icon name="check" size="15" class="mr-1.5" />{{ t('courseBuilder.publish') }}
          </AppButton>
          <AppButton variant="outline" :loading="submitting" @click="onPublish('DRAFT')">{{ t('courseBuilder.saveDraft') }}</AppButton>
          <Badge variant="neutral">{{ t('courseBuilder.nextStepsHint') }}</Badge>
        </div>
      </div>

      <div v-if="stepIndex < steps.length - 1" class="mt-6 flex justify-between border-t border-border pt-5">
        <AppButton variant="ghost" :disabled="stepIndex === 0" @click="back">{{ t('common.goBack') }}</AppButton>
        <AppButton icon="arrow-right" icon-position="right" :disabled="!canProceed" @click="next">{{ t('courseBuilder.continue') }}</AppButton>
      </div>
      <div v-else class="mt-6 flex justify-start border-t border-border pt-5">
        <AppButton variant="ghost" @click="back">{{ t('common.goBack') }}</AppButton>
      </div>
    </AppCard>
  </div>
</template>
