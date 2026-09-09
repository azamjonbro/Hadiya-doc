<script setup>
/**
 * The grading queue: work waiting to be marked, oldest first.
 *
 * Oldest first is not a display preference. A newest-first queue leaves the
 * oldest submission waiting for ever, and that is the one whose author has
 * already asked twice where their mark is.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { homeworkApi } from '@/services/homework'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()

const items = ref([])
const loading = ref(true)

const open = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const saving = ref(false)
const form = ref({ score: 0, feedback: '', rubricScores: {} })

// Derived from the rubric whenever there is one, so the total a reviewer
// sees is the total the server will store — a number that disagrees with
// the criteria it is made of is the fastest way to lose a learner's trust.
const rubricTotal = computed(() => {
  if (!detail.value?.rubric) return null
  return detail.value.rubric.criteria.reduce(
    (sum, criterion) => sum + (Number(form.value.rubricScores[criterion.id]) || 0),
    0
  )
})

const effectiveScore = computed(() => (rubricTotal.value === null ? Number(form.value.score) || 0 : rubricTotal.value))

function waitingFor(row) {
  const hours = Math.floor((Date.now() - new Date(row.submittedAt)) / 3600000)
  if (hours < 1) return t('grading.justNow')
  if (hours < 24) return t('grading.hoursAgo', { hours })
  return t('grading.daysAgo', { days: Math.floor(hours / 24) })
}

async function load() {
  loading.value = true
  try {
    items.value = await homeworkApi.queue({ limit: 100 })
  } catch (error) {
    toast.error(apiErrorText(error, t('grading.loadError')))
  } finally {
    loading.value = false
  }
}

async function openSubmission(row) {
  open.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await homeworkApi.submission(row.id)
    form.value = {
      score: detail.value.score ?? 0,
      feedback: detail.value.feedback ?? '',
      rubricScores: Object.fromEntries(
        (detail.value.rubric?.criteria ?? []).map((criterion) => [
          criterion.id,
          detail.value.rubricScores.find((entry) => entry.criterionId === criterion.id)?.score ?? 0,
        ])
      ),
    }
  } catch (error) {
    toast.error(apiErrorText(error, t('grading.loadError')))
  } finally {
    detailLoading.value = false
  }
}

async function save(returnForRevision) {
  saving.value = true
  try {
    await homeworkApi.grade(detail.value.id, {
      score: effectiveScore.value,
      feedback: form.value.feedback,
      rubricScores: detail.value.rubric
        ? detail.value.rubric.criteria.map((criterion) => ({
            criterionId: criterion.id,
            score: Number(form.value.rubricScores[criterion.id]) || 0,
          }))
        : [],
      returnForRevision,
    })
    toast.success(returnForRevision ? t('grading.returned') : t('grading.graded'))
    open.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('grading.saveError')))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('grading.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('grading.subtitle') }}</p>
      </div>
      <AppButton variant="secondary" icon="refresh" @click="load">{{ t('common.refresh') }}</AppButton>
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-xl" />
    </div>
    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="check-check"
      :title="t('grading.emptyTitle')"
      :description="t('grading.emptyDescription')"
    />
    <div v-else class="mt-6 space-y-2">
      <AppCard
        v-for="row in items"
        :key="row.id"
        hover
        class="flex cursor-pointer flex-wrap items-center justify-between gap-4 p-4"
        @click="openSubmission(row)"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate font-medium text-ink">{{ row.fullName }}</p>
            <Badge v-if="row.late" variant="warning" size="sm">{{ t('grading.late') }}</Badge>
            <Badge v-if="row.attemptNo > 1" variant="neutral" size="sm">
              {{ t('grading.attemptNo', { number: row.attemptNo }) }}
            </Badge>
          </div>
          <p class="mt-0.5 text-small text-ink-muted">{{ row.assignmentTitle }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-3 text-caption text-ink-faint">
          <span>{{ waitingFor(row) }}</span>
          <Icon name="chevron-right" size="16" />
        </div>
      </AppCard>
    </div>

    <Modal v-model="open" :title="t('grading.review')" size="lg">
      <div v-if="detailLoading" class="space-y-2">
        <Skeleton v-for="n in 4" :key="n" class="h-12 w-full rounded-lg" />
      </div>
      <div v-else-if="detail" class="space-y-4">
        <div>
          <p class="text-small font-medium text-ink">{{ detail.assignment?.title }}</p>
          <p class="mt-0.5 text-caption text-ink-faint">
            {{ detail.fullName }} ·
            {{ t('grading.attemptNo', { number: detail.attemptNo }) }} ·
            {{ new Date(detail.submittedAt).toLocaleString(locale) }}
            <template v-if="detail.late"> · <span class="text-warning">{{ t('grading.late') }}</span></template>
          </p>
        </div>

        <div v-if="detail.assignment?.instructions" class="rounded-lg bg-surface-2 p-3 text-small text-ink-muted">
          {{ detail.assignment.instructions }}
        </div>

        <div v-if="detail.text" class="whitespace-pre-wrap rounded-lg border border-border p-3 text-small text-ink">
          {{ detail.text }}
        </div>

        <div v-if="detail.files.length" class="space-y-1">
          <p class="text-small font-medium text-ink">{{ t('grading.files') }}</p>
          <p v-for="file in detail.files" :key="file.key" class="flex items-center gap-2 text-small text-ink-muted">
            <Icon name="paperclip" size="14" />
            {{ file.name || file.key }}
          </p>
        </div>

        <div v-if="detail.links.length" class="space-y-1">
          <p class="text-small font-medium text-ink">{{ t('grading.links') }}</p>
          <a
            v-for="link in detail.links"
            :key="link"
            :href="link"
            target="_blank"
            rel="noopener"
            class="block truncate text-small text-primary hover:underline"
          >
            {{ link }}
          </a>
        </div>

        <!-- The rubric, when the assignment has one. -->
        <div v-if="detail.rubric" class="space-y-3 border-t border-border pt-4">
          <p class="text-small font-medium text-ink">{{ detail.rubric.name }}</p>
          <div v-for="criterion in detail.rubric.criteria" :key="criterion.id" class="rounded-lg border border-border p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-small text-ink">{{ criterion.label }}</p>
                <p v-if="criterion.description" class="text-caption text-ink-faint">{{ criterion.description }}</p>
              </div>
              <span class="shrink-0 text-caption text-ink-faint">/ {{ criterion.maxScore }}</span>
            </div>
            <div v-if="criterion.levels?.length" class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="level in criterion.levels"
                :key="level.label"
                type="button"
                class="rounded-full border px-2.5 py-1 text-caption transition-default"
                :class="Number(form.rubricScores[criterion.id]) === level.score ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-muted hover:bg-surface-hover'"
                @click="form.rubricScores[criterion.id] = level.score"
              >
                {{ level.label }} · {{ level.score }}
              </button>
            </div>
            <AppInput
              v-else
              class="mt-2 w-28"
              type="number"
              :model-value="form.rubricScores[criterion.id]"
              @update:model-value="(value) => (form.rubricScores[criterion.id] = Number(value))"
            />
          </div>
          <p class="text-small text-ink">
            {{ t('grading.total') }}: <span class="font-semibold">{{ rubricTotal }}</span> / {{ detail.assignment?.maxScore }}
          </p>
        </div>

        <AppInput
          v-else
          v-model="form.score"
          type="number"
          :label="t('grading.score')"
          :hint="t('grading.outOf', { max: detail.assignment?.maxScore ?? 100 })"
        />

        <div>
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('grading.feedback') }}</label>
          <textarea
            v-model="form.feedback"
            rows="3"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="open = false">{{ t('common.cancel') }}</AppButton>
        <!-- Returning it is a different act from grading it: the learner
             who sees "graded" assumes it is final. -->
        <AppButton variant="outline" :loading="saving" @click="save(true)">{{ t('grading.returnForRevision') }}</AppButton>
        <AppButton :loading="saving" @click="save(false)">{{ t('grading.grade') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
