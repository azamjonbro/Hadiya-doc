<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const steps = [
  { key: 'basics', labelKey: 'courseBuilder.steps.basics', icon: 'file-text' },
  { key: 'media', labelKey: 'courseBuilder.steps.media', icon: 'layers' },
  { key: 'review', labelKey: 'courseBuilder.steps.review', icon: 'check-circle' },
]
const stepIndex = ref(0)

const form = reactive({ title: '', description: '', cover: '', banner: '', status: 'DRAFT' })
const submitting = ref(false)
const errorMessage = ref('')

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
    const course = await coursesApi.create({ ...form, status })
    toast.success(t('courseBuilder.created'))
    router.push(`/admin/courses/${course.id}`)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink" @click="router.push('/admin/courses')">
      <Icon name="chevron-left" size="16" />
      {{ t('courses.title') }}
    </button>

    <h1 class="mt-4 text-h1 text-ink">{{ t('courseBuilder.title') }}</h1>

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
        <AppInput v-model="form.title" required :label="t('courses.fields.title')" />
        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('courses.fields.description') }}</label>
          <textarea
            v-model="form.description"
            rows="4"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <!-- Step 2: Media -->
      <div v-else-if="stepIndex === 1" class="space-y-4">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.media') }}</h2>
        <ImageUploadField v-model="form.cover" :label="t('courseBuilder.coverUrl')" aspect="aspect-video" />
        <ImageUploadField v-model="form.banner" :label="t('courseBuilder.bannerUrl')" aspect="aspect-[3/1]" />
        <p class="text-caption text-ink-faint">{{ t('courseBuilder.mediaHint') }}</p>
      </div>

      <!-- Step 3: Review -->
      <div v-else class="space-y-5">
        <h2 class="text-h3 text-ink">{{ t('courseBuilder.steps.review') }}</h2>
        <div class="rounded-lg border border-border bg-surface-2 p-4">
          <p class="text-small font-semibold text-ink">{{ form.title || '—' }}</p>
          <p v-if="form.description" class="mt-1 text-small text-ink-muted">{{ form.description }}</p>
          <p v-if="!form.cover" class="mt-2 text-caption text-ink-faint">{{ t('courseBuilder.noCover') }}</p>
        </div>
        <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <AppButton :loading="submitting" @click="onPublish('PUBLISHED')">
            <Icon name="check" size="15" class="mr-1.5" />{{ t('courseBuilder.publish') }}
          </AppButton>
          <AppButton variant="outline" :loading="submitting" @click="onPublish('DRAFT')">{{ t('courseBuilder.saveDraft') }}</AppButton>
          <Badge variant="neutral">{{ t('courseBuilder.nextStepsHint') }}</Badge>
        </div>
      </div>

      <div v-if="stepIndex < 2" class="mt-6 flex justify-between border-t border-border pt-5">
        <AppButton variant="ghost" :disabled="stepIndex === 0" @click="back">{{ t('common.goBack') }}</AppButton>
        <AppButton icon="arrow-right" icon-position="right" :disabled="!canProceed" @click="next">{{ t('courseBuilder.continue') }}</AppButton>
      </div>
      <div v-else class="mt-6 flex justify-start border-t border-border pt-5">
        <AppButton variant="ghost" @click="back">{{ t('common.goBack') }}</AppButton>
      </div>
    </AppCard>
  </div>
</template>
