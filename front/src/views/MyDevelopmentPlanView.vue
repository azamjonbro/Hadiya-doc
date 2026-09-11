<script setup>
/**
 * The employee's own development plan (13.4).
 *
 * The one thing this screen has to make obvious is which goals move on their
 * own and which the person is expected to report. A COURSE goal is worth
 * whatever their course record says and a COMPETENCY goal whatever level was
 * assessed; the API refuses a typed percentage on either with
 * GOAL_PROGRESS_DERIVED. So the control is rendered only where the server
 * says `progressSource` is MANUAL — showing it everywhere and letting a 400
 * teach the rule would leave somebody believing they had recorded something.
 *
 * The list endpoint (`/development-plans/mine`) carries no reviews, and the
 * plan endpoint does. Rather than fetch every plan's detail up front for a
 * section most people never open, the history is fetched the first time it
 * is expanded — `devplan:read:own` opens `GET /:id` for the plan's owner.
 */
import { onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { developmentPlansApi } from '@/services/developmentPlans'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'

const { t, locale } = useI18n()
const toast = useToast()

const plans = ref([])
const loading = ref(true)
// goalId → { progressPercent, status }, only ever holding manual goals.
const drafts = ref({})
const savingGoalId = ref('')
// planId → reviews, filled on first expand.
const reviews = ref({})
const openHistoryId = ref('')
const historyLoading = ref('')

const baseId = useId()

// Dropping a goal is a decision about the plan, not a report about the work,
// so it is left to the manager's screen; these three are what the person can
// honestly say about their own progress.
const REPORTABLE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'ACHIEVED']

const planStatusVariant = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  REVIEWED: 'primary',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
}
const goalStatusVariant = { PLANNED: 'neutral', IN_PROGRESS: 'info', ACHIEVED: 'success', DROPPED: 'neutral' }

function statusOptions() {
  return REPORTABLE_STATUSES.map((value) => ({ value, label: t(`devplan.goalStatus.${value}`) }))
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
}

function progressVariant(percent) {
  if (percent >= 100) return 'success'
  if (percent > 0) return 'primary'
  return 'warning'
}

function seedDrafts(items) {
  for (const plan of items) {
    for (const goal of plan.goals) {
      if (goal.progressSource !== 'MANUAL') continue
      drafts.value[goal.id] = { progressPercent: goal.progressPercent, status: goal.status }
    }
  }
}

async function load() {
  loading.value = true
  try {
    plans.value = await developmentPlansApi.mine()
    seedDrafts(plans.value)
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.loadError')))
  } finally {
    loading.value = false
  }
}

async function saveProgress(plan, goal) {
  const draft = drafts.value[goal.id]
  if (!draft) return
  savingGoalId.value = goal.id
  try {
    const updated = await developmentPlansApi.setGoalProgress(plan.id, goal.id, {
      progressPercent: Number(draft.progressPercent),
      status: draft.status,
    })
    // The call answers with the whole plan re-derived, so the other goals'
    // figures stay honest too rather than being patched locally.
    const index = plans.value.findIndex((entry) => entry.id === plan.id)
    if (index !== -1) plans.value[index] = updated
    seedDrafts([updated])
    toast.success(t('devplan.saved'))
  } catch (error) {
    toast.error(apiErrorText(error, t('devplan.saveError')))
  } finally {
    savingGoalId.value = ''
  }
}

async function toggleHistory(plan) {
  if (openHistoryId.value === plan.id) {
    openHistoryId.value = ''
    return
  }
  openHistoryId.value = plan.id
  if (reviews.value[plan.id]) return
  historyLoading.value = plan.id
  try {
    const detail = await developmentPlansApi.get(plan.id)
    reviews.value[plan.id] = detail.reviews ?? []
  } catch (error) {
    openHistoryId.value = ''
    toast.error(apiErrorText(error, t('devplan.loadError')))
  } finally {
    historyLoading.value = ''
  }
}

onMounted(load)
</script>

<template>

  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')]"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ t('devplan.mine') }}</h1>
        <p class="mt-2 text-white/80 max-w-2xl text-body drop-shadow">{{ t('devplan.mineSubtitle') }}</p>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">

    <div v-if="loading" class="mt-6 space-y-4">
      <Skeleton v-for="n in 2" :key="n" class="h-56 w-full rounded-lg" />
    </div>

    <EmptyState
      v-else-if="!plans.length"
      class="mt-6"
      icon="file-text"
      :title="t('devplan.noPlan')"
      :description="t('devplan.noPlanHint')"
    />

    <div v-else class="mt-6 space-y-5">
      <AppCard v-for="plan in plans" :key="plan.id" class="p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-h3 text-ink">{{ plan.title }}</h2>
              <Badge :variant="planStatusVariant[plan.status]" size="sm">
                {{ t(`devplan.status.${plan.status}`) }}
              </Badge>
              <Badge v-if="plan.lockedVersion" variant="primary" size="sm">
                {{ t('devplan.lockedVersion', { n: plan.lockedVersion }) }}
              </Badge>
            </div>
            <p class="mt-1 text-small text-ink-muted">
              {{ t('devplan.period') }}: {{ formatDate(plan.periodStart) }} — {{ formatDate(plan.periodEnd) }}
            </p>
            <p class="mt-1 text-caption text-ink-faint">
              {{ t('devplan.goalCount', { count: plan.goalCount }) }} ·
              {{ t('devplan.lastReview') }}:
              {{ plan.lastReviewAt ? formatDate(plan.lastReviewAt) : t('devplan.never') }}
            </p>
          </div>

          <div class="relative shrink-0">
            <ProgressRing :value="plan.progressPercent" :size="96" :variant="progressVariant(plan.progressPercent)" />
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-h3 text-ink">{{ plan.progressPercent }}%</span>
              <span class="text-caption text-ink-faint">{{ t('devplan.overall') }}</span>
            </div>
          </div>
        </div>

        <p v-if="!plan.goals.length" class="mt-5 text-small text-ink-faint">{{ t('devplan.noGoals') }}</p>

        <ul v-else class="mt-5 space-y-3">
          <li v-for="goal in plan.goals" :key="goal.id" class="rounded-lg border border-border p-4">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="info" size="sm">{{ t(`devplan.type.${goal.type}`) }}</Badge>
              <p class="min-w-0 flex-1 truncate font-medium text-ink">{{ goal.title }}</p>
              <Badge :variant="goalStatusVariant[goal.status]" size="sm">
                {{ t(`devplan.goalStatus.${goal.status}`) }}
              </Badge>
              <Badge v-if="goal.overdue" variant="danger" size="sm">{{ t('devplan.overdue') }}</Badge>
            </div>

            <p v-if="goal.description" class="mt-1.5 text-small text-ink-muted">{{ goal.description }}</p>

            <div class="mt-3 flex items-center gap-3">
              <ProgressBar class="flex-1" :value="goal.progressPercent" :variant="progressVariant(goal.progressPercent)" />
              <span class="w-10 shrink-0 text-right text-small text-ink-muted">{{ goal.progressPercent }}%</span>
            </div>

            <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
              <span>
                <Icon :name="goal.progressSource === 'DERIVED' ? 'refresh' : 'pencil'" size="11" class="mr-1 inline" />
                {{ goal.progressSource === 'DERIVED' ? t('devplan.derived') : t('devplan.manual') }}
              </span>
              <span v-if="goal.type === 'COMPETENCY' && goal.targetLevel">
                {{ t('devplan.levelOf', { current: goal.currentLevel ?? 0, target: goal.targetLevel }) }}
              </span>
              <span v-if="goal.targetDate">{{ t('devplan.targetDate') }}: {{ formatDate(goal.targetDate) }}</span>
              <span v-if="goal.cpeCredits">
                {{ t('devplan.cpe') }}: {{ goal.cpeCredits }}
                <template v-if="goal.cpeCreditedAt">· {{ t('devplan.cpeCredited') }}</template>
              </span>
            </p>

            <!-- Where the number comes from, in the person's own words. The
                 derived kinds get the sentence; only the manual kinds get a
                 control, because they are the only ones the API will move. -->
            <p v-if="goal.progressSource === 'DERIVED'" class="mt-2 text-caption text-ink-faint">
              <Icon name="info" size="12" class="mr-1 inline" />
              {{ t('devplan.derivedHint') }}
            </p>

            <div v-else-if="drafts[goal.id]" class="mt-3 rounded-md bg-surface-2 p-3">
              <p class="text-caption text-ink-faint">{{ t('devplan.manualHint') }}</p>
              <div class="mt-2 flex flex-wrap items-end gap-3">
                <div class="min-w-[12rem] flex-1">
                  <label :for="`${baseId}-${goal.id}-percent`" class="mb-1.5 block text-small font-medium text-ink">
                    {{ t('devplan.progressPercentLabel') }}: {{ drafts[goal.id].progressPercent }}%
                  </label>
                  <input
                    :id="`${baseId}-${goal.id}-percent`"
                    v-model.number="drafts[goal.id].progressPercent"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    class="h-1.5 w-full cursor-pointer accent-primary"
                  />
                </div>
                <AppSelect
                  v-model="drafts[goal.id].status"
                  class="w-44"
                  :label="t('devplan.goalStatusLabel')"
                  :options="statusOptions()"
                />
                <AppButton
                  size="sm"
                  icon="check"
                  :loading="savingGoalId === goal.id"
                  @click="saveProgress(plan, goal)"
                >
                  {{ t('devplan.updateProgress') }}
                </AppButton>
              </div>
            </div>
          </li>
        </ul>

        <!-- Review history -->
        <div class="mt-5 border-t border-border pt-4">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded text-small font-medium text-primary hover:underline"
            :aria-expanded="openHistoryId === plan.id"
            @click="toggleHistory(plan)"
          >
            <Icon :name="openHistoryId === plan.id ? 'chevron-up' : 'chevron-down'" size="14" />
            {{ t('devplan.reviewHistory') }}
          </button>

          <div v-if="openHistoryId === plan.id" class="mt-3">
            <div v-if="historyLoading === plan.id" class="space-y-2">
              <Skeleton v-for="n in 2" :key="n" class="h-16 w-full rounded-md" />
            </div>
            <p v-else-if="!reviews[plan.id] || !reviews[plan.id].length" class="text-small text-ink-faint">
              {{ t('devplan.noReviews') }}
            </p>
            <ul v-else class="space-y-3">
              <li v-for="review in reviews[plan.id]" :key="review.id" class="rounded-md border border-border p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge :variant="review.decision === 'APPROVED' ? 'success' : 'warning'" size="sm">
                    {{ t(`devplan.decisionValue.${review.decision}`) }}
                  </Badge>
                  <span class="text-small text-ink">{{ review.reviewerName }}</span>
                  <span class="text-caption text-ink-faint">{{ formatDate(review.reviewedAt) }}</span>
                  <span class="text-caption text-ink-faint">
                    {{ review.overallRating ? t('devplan.rating') + ': ' + review.overallRating : t('devplan.noRating') }}
                  </span>
                </div>
                <p v-if="review.period" class="mt-1 text-caption text-ink-faint">
                  {{ t('devplan.period') }}: {{ review.period }}
                </p>
                <p v-if="review.comment" class="mt-1.5 whitespace-pre-line text-small text-ink-muted">
                  {{ review.comment }}
                </p>
                <ul v-if="review.goalComments.length" class="mt-2 space-y-1">
                  <li v-for="entry in review.goalComments" :key="entry.goalId" class="text-caption text-ink-muted">
                    <Icon name="message-square" size="11" class="mr-1 inline" />
                    {{ entry.comment }} ({{ entry.progressPercent }}%)
                  </li>
                </ul>
                <p v-if="review.cpeCreditsAwarded" class="mt-1.5 text-caption text-success">
                  <Icon name="award" size="12" class="mr-1 inline" />
                  {{ t('devplan.creditsAwarded', { n: review.cpeCreditsAwarded }) }}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </AppCard>
    </div>
    </div>
  </div>
</template>
