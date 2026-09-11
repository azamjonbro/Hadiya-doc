<script setup>
/**
 * One cycle: who has answered, and — once it is closed — what came back.
 *
 * The report is rendered exactly as the service hands it over. Every number
 * that could identify a rater is already withheld there: a sealed group
 * arrives with `average: null` and `count: null`, and the "others" figure is
 * built from revealed groups only so the sealed ones cannot be recovered by
 * subtraction. Nothing on this screen recomputes an average or fills a blank
 * — a chart drawn from the parts we do have would quietly undo the gate.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { review360Api } from '@/services/review360'
import { competenciesApi } from '@/services/competencies'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import { formatDate } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()

const RATER_GROUPS = ['SELF', 'MANAGER', 'PEER', 'SUBORDINATE']
const statusVariant = { DRAFT: 'neutral', RUNNING: 'primary', CLOSED: 'success' }

const loading = ref(true)
const data = ref(null)
const competencyNames = ref(new Map())

const reportOpen = ref(false)
const reportLoading = ref(false)
const report = ref(null)

const canManage = computed(() => auth.hasPermission('review360:manage'))
const cycle = computed(() => data.value?.cycle ?? null)
const percent = computed(() =>
  data.value?.invited ? Math.round((data.value.responded / data.value.invited) * 100) : 0
)

async function load() {
  loading.value = true
  try {
    data.value = await review360Api.progress(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.loadError')))
  } finally {
    loading.value = false
  }
}

// Names for the competency averages at the foot of a report. The catalogue
// needs its own permission, which somebody who may only read 360° results
// does not necessarily hold — so this is best-effort and the report falls
// back to a generic label rather than failing.
async function loadCompetencyNames() {
  try {
    const items = await competenciesApi.list({ status: 'ACTIVE' })
    competencyNames.value = new Map(items.map((item) => [item.id, `${item.code} · ${item.name}`]))
  } catch {
    competencyNames.value = new Map()
  }
}

function competencyLabel(id) {
  return competencyNames.value.get(id) ?? t('review360.reportCompetencyUnknown')
}

async function closeCycle() {
  const ok = await confirm.ask({
    title: t('review360.confirmCloseTitle'),
    message: t('review360.confirmCloseMessage'),
    confirmLabel: t('review360.closeCycle'),
  })
  if (!ok) return
  try {
    const closed = await review360Api.close(cycle.value.id)
    toast.success(t('review360.cycleClosed'))
    if (closed.competencyLevelsPosted) {
      toast.info(t('review360.levelsPosted', { count: closed.competencyLevelsPosted }))
    }
    if (closed.competencyLevelsSkipped?.length) {
      toast.warning(t('review360.levelsSkipped', { count: closed.competencyLevelsSkipped.length }))
    }
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.saveError')))
  }
}

async function openReport(subject) {
  reportOpen.value = true
  reportLoading.value = true
  report.value = null
  try {
    report.value = await review360Api.results(route.params.id, subject.subjectId)
  } catch (error) {
    reportOpen.value = false
    toast.error(apiErrorText(error, t('review360.loadError')))
  } finally {
    reportLoading.value = false
  }
}

// Only the groups this subject actually has anybody in. Filtered here
// rather than with a v-if inside the v-for, which Vue evaluates per row
// before the loop variable exists.
function askedGroups(subject) {
  return RATER_GROUPS.filter((group) => subject.groups[group]?.invited).map((group) => ({
    group,
    ...subject.groups[group],
  }))
}

// A rating is only ever printed when the service sent one; `null` means the
// group is sealed or nobody rated, and the two are told apart by `revealed`.
function ratingText(value) {
  return value === null || value === undefined ? '—' : value
}

onMounted(async () => {
  await load()
  await loadCompetencyNames()
})
</script>

<template>
  <div class="px-6 py-8">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 text-small text-ink-muted transition-default hover:text-ink"
      @click="router.push({ name: 'admin-review360' })"
    >
      <Icon name="arrow-left" size="14" />
      {{ t('review360.backToCycles') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-24 w-full rounded-lg" />
      <Skeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
    </div>

    <template v-else-if="cycle">
      <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-[24px] font-semibold text-ink">{{ cycle.name }}</h1>
            <Badge :variant="statusVariant[cycle.status]" size="sm">
              {{ t(`review360.status.${cycle.status}`) }}
            </Badge>
          </div>
          <p v-if="cycle.description" class="mt-1 text-small text-ink-muted">{{ cycle.description }}</p>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
            <span>{{ t('review360.subjectCount', { count: cycle.subjectCount }) }}</span>
            <span>
              <Icon name="clock" size="11" class="mr-1 inline" />
              {{ cycle.dueAt ? formatDate(cycle.dueAt, locale) : t('review360.noDue') }}
            </span>
            <span v-if="cycle.launchedAt">
              {{ t('review360.launchedAt') }}: {{ formatDate(cycle.launchedAt, locale) }}
            </span>
            <span v-if="cycle.closedAt">{{ t('review360.closedAt') }}: {{ formatDate(cycle.closedAt, locale) }}</span>
            <span>{{ t('review360.anonymityThreshold') }}: {{ cycle.anonymityThreshold }}</span>
          </p>
        </div>

        <AppButton v-if="canManage && cycle.status === 'RUNNING'" variant="secondary" icon="check" @click="closeCycle">
          {{ t('review360.closeCycle') }}
        </AppButton>
      </div>

      <AppCard class="mt-5 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-small font-medium text-ink">{{ t('review360.overallProgress') }}</p>
          <p class="text-small text-ink-muted">
            {{ t('review360.progressOf', { responded: data.responded, invited: data.invited }) }} · {{ percent }}%
          </p>
        </div>
        <ProgressBar class="mt-2" :value="percent" :variant="cycle.status === 'CLOSED' ? 'success' : 'primary'" />
      </AppCard>

      <EmptyState
        v-if="!data.subjects.length"
        class="mt-6"
        icon="users"
        :title="t('review360.emptyProgress')"
        :description="cycle.status === 'DRAFT' ? t('review360.emptyCyclesHint') : ''"
      />

      <template v-else>
        <h2 class="mt-7 text-h3 text-ink">{{ t('review360.subjectProgress') }}</h2>

        <div class="mt-3 space-y-3">
          <AppCard v-for="subject in data.subjects" :key="subject.subjectId" class="p-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="truncate font-medium text-ink">{{ subject.fullName }}</p>
                  <span v-if="subject.position" class="text-caption text-ink-faint">{{ subject.position }}</span>
                  <Badge v-if="subject.sealedGroups.length" variant="warning" size="sm">
                    {{ t('review360.sealedGroupsShort') }}:
                    {{ subject.sealedGroups.map((group) => t(`review360.group.${group}`)).join(', ') }}
                  </Badge>
                </div>

                <div class="mt-2 max-w-md">
                  <div class="flex items-center justify-between text-caption text-ink-muted">
                    <span>
                      {{ t('review360.progressOf', { responded: subject.responded, invited: subject.invited }) }}
                    </span>
                    <span>{{ subject.percent }}%</span>
                  </div>
                  <ProgressBar class="mt-1" size="sm" :value="subject.percent" />
                </div>

                <!-- Who is still owed a reminder, by group -->
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-faint">
                  <span v-for="row in askedGroups(subject)" :key="row.group">
                    {{ t(`review360.group.${row.group}`) }}: {{ row.responded }}/{{ row.invited }}
                  </span>
                </div>
              </div>

              <div class="shrink-0">
                <AppButton
                  v-if="cycle.status === 'CLOSED'"
                  variant="secondary"
                  size="sm"
                  icon="bar-chart"
                  @click="openReport(subject)"
                >
                  {{ t('review360.viewReport') }}
                </AppButton>
                <p v-else class="max-w-[12rem] text-caption text-ink-faint">
                  {{ t('review360.reportOnlyWhenClosed') }}
                </p>
              </div>
            </div>
          </AppCard>
        </div>
      </template>
    </template>

    <!-- ------------------------------- report ------------------------------- -->
    <Modal
      v-model="reportOpen"
      size="xl"
      :title="report ? t('review360.reportFor', { name: report.subject.fullName }) : t('review360.viewReport')"
    >
      <div v-if="reportLoading" class="space-y-2">
        <Skeleton v-for="n in 5" :key="n" class="h-12 w-full rounded-md" />
      </div>

      <div v-else-if="report" class="space-y-5">
        <!-- Which groups are readable at all, and why not -->
        <div>
          <p class="text-small font-medium text-ink">{{ t('review360.reportGroups') }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <div
              v-for="row in report.groups"
              :key="row.group"
              class="rounded-md border border-border px-3 py-2 text-caption"
              :class="row.revealed ? 'text-ink-muted' : 'border-warning/40 bg-warning-subtle text-warning'"
            >
              <span class="font-medium text-ink">{{ t(`review360.group.${row.group}`) }}</span>
              <span class="ml-1.5">{{ row.responded }}/{{ row.invited }}</span>
              <Badge class="ml-1.5" :variant="row.anonymous ? 'info' : 'neutral'" size="sm">
                {{ row.anonymous ? t('review360.reportAnonymous') : t('review360.reportAttributed') }}
              </Badge>
              <p v-if="!row.revealed" class="mt-1 max-w-xs">
                {{ t('review360.reportSealedHint', { responded: row.responded, threshold: row.threshold }) }}
              </p>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!report.questions.length"
          icon="file-text"
          :title="t('review360.reportEmpty')"
          description=""
        />

        <!-- Question by question -->
        <div v-else class="space-y-3">
          <div v-for="item in report.questions" :key="item.questionId" class="rounded-lg border border-border p-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <p class="min-w-0 flex-1 text-small font-medium text-ink">{{ item.text }}</p>
              <Badge size="sm" variant="neutral">{{ t(`review360.questionType.${item.type}`) }}</Badge>
            </div>

            <div v-if="item.type === 'RATING'" class="mt-2 flex flex-wrap items-center gap-4 text-small">
              <span class="text-ink-muted">
                {{ t('review360.reportSelf') }}:
                <span class="font-medium text-ink">{{ ratingText(item.self) }}</span>
              </span>
              <span class="text-ink-muted">
                {{ t('review360.reportOthers') }}:
                <span class="font-medium text-ink">{{ ratingText(item.others) }}</span>
              </span>
              <span v-if="item.gap !== null" class="text-ink-muted">
                {{ t('review360.reportGap') }}:
                <span class="font-medium" :class="item.gap > 0 ? 'text-warning' : 'text-success'">
                  {{ item.gap > 0 ? '+' : '' }}{{ item.gap }}
                </span>
              </span>
              <span class="text-caption text-ink-faint">/ {{ item.scaleMax }}</span>
            </div>

            <div class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="cell in item.groups"
                :key="cell.group"
                class="rounded-md bg-surface-2 px-2.5 py-1.5 text-caption"
              >
                <span class="text-ink-muted">{{ t(`review360.group.${cell.group}`) }}</span>
                <template v-if="cell.revealed">
                  <span class="ml-1.5 font-medium text-ink">{{ ratingText(cell.average) }}</span>
                  <span v-if="cell.count !== null" class="ml-1 text-ink-faint">({{ cell.count }})</span>
                </template>
                <span v-else class="ml-1.5 inline-flex items-center gap-1 text-warning">
                  <Icon name="lock" size="11" />
                  {{ t('review360.reportSealed') }} {{ cell.responded }}/{{ cell.invited }}
                </span>
              </div>
            </div>

            <div v-if="item.comments.length" class="mt-3 space-y-1.5">
              <p class="text-caption text-ink-faint">{{ t('review360.reportComments') }}</p>
              <p
                v-for="(comment, index) in item.comments"
                :key="index"
                class="rounded-md border border-border bg-surface px-3 py-2 text-small text-ink"
              >
                <span class="mr-1.5 text-caption text-ink-faint">
                  {{ t(`review360.group.${comment.group}`) }}
                </span>
                {{ comment.text }}
              </p>
            </div>
          </div>
        </div>

        <!-- Competency averages, when questions were linked to 13.1 -->
        <div v-if="report.competencies.length">
          <p class="text-small font-medium text-ink">{{ t('review360.reportCompetencies') }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <span
              v-for="row in report.competencies"
              :key="row.competencyId"
              class="rounded-full bg-surface-2 px-3 py-1 text-caption text-ink-muted"
            >
              {{ competencyLabel(row.competencyId) }}:
              <span class="font-medium text-ink">{{ ratingText(row.average) }}</span>
            </span>
          </div>
        </div>

        <p class="text-caption text-ink-faint">{{ t('review360.reportGapHint') }}</p>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="reportOpen = false">{{ t('common.close') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
