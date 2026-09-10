<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { assessmentsApi } from '@/services/assessments'
import { useFaceGate } from '@/composables/useFaceGate'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import FaceGateOverlay from '@/components/face/FaceGateOverlay.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

/**
 * A module test is a supervised sitting, so this page has three phases:
 * briefing → running → result. The rules it enforces here (countdown,
 * tab-switch limit) are the visible half; the binding half lives in
 * assessment.service.js, because anything enforced only in a browser is
 * enforced only until someone opens devtools.
 */
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const phase = ref('briefing') // briefing | running | result
const loading = ref(true)
const starting = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

const briefing = ref(null)
const assessment = ref(null)
const session = ref(null)
const selected = reactive({})
const result = ref(null)

// Counted down from the server's expiresAt rather than from a local start
// time, so a reload resumes the same clock instead of granting more time.
const remainingMs = ref(0)
let tickTimer = null

const focusWarning = ref(false)
const focusLossCount = ref(0)
let reporting = false

const questionCount = computed(() => assessment.value?.questions.length ?? briefing.value?.questionCount ?? 0)
const answeredCount = computed(
  () => (assessment.value?.questions ?? []).filter((q) => selected[q.id] !== undefined).length
)
const allAnswered = computed(() => questionCount.value > 0 && answeredCount.value === questionCount.value)

const remainingLabel = computed(() => {
  const total = Math.max(0, Math.floor(remainingMs.value / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
// Last two minutes turn red — the only warning a countdown really needs.
const timeCritical = computed(() => remainingMs.value > 0 && remainingMs.value < 120_000)

function collectAnswers() {
  return (assessment.value?.questions ?? [])
    .filter((q) => selected[q.id] !== undefined)
    .map((q) => ({ questionId: q.id, selectedOptionIndex: selected[q.id] }))
}

async function loadBriefing() {
  loading.value = true
  errorMessage.value = ''
  try {
    briefing.value = await assessmentsApi.getById(route.params.id)
    // A sitting left running (reload, crash, closed laptop) is resumed
    // rather than restarted.
    if (briefing.value.activeSession) await start()
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

// Who is sitting the test is the question the whole exam rests on, so the
// questions are not handed over until the camera says it is the enrolled
// employee. The API refuses /start until then; this only puts the check on
// screen and starts again once it passes.
const faceGate = useFaceGate(() => start())

async function start() {
  starting.value = true
  errorMessage.value = ''
  try {
    const data = await assessmentsApi.start(route.params.id)
    assessment.value = data.assessment
    session.value = data.session
    focusLossCount.value = data.session.focusLossCount
    phase.value = 'running'
    beginTicking()
    attachProctoring()
  } catch (error) {
    if (!faceGate.claim(error)) errorMessage.value = apiErrorText(error)
  } finally {
    starting.value = false
  }
}

function beginTicking() {
  const tick = () => {
    remainingMs.value = new Date(session.value.expiresAt).getTime() - Date.now()
    if (remainingMs.value <= 0) {
      clearInterval(tickTimer)
      // The agreed rule: time up submits whatever was answered.
      submit({ auto: true })
    }
  }
  tick()
  clearInterval(tickTimer)
  tickTimer = setInterval(tick, 1000)
}

// Browsers cannot stop a new tab from being opened — nothing on a web page
// can. What they do report is this tab losing focus, which is what the rule
// is actually built on.
async function onFocusLost() {
  if (phase.value !== 'running' || reporting) return
  reporting = true
  try {
    const data = await assessmentsApi.reportFocusLoss(route.params.id, collectAnswers())
    focusLossCount.value = data.focusLossCount
    if (data.terminated) {
      finish(data.result)
    } else {
      focusWarning.value = true
    }
  } catch {
    // A dropped report must not wedge the test; the server still holds the
    // authoritative count and the deadline.
  } finally {
    reporting = false
  }
}

function handleVisibility() {
  if (document.visibilityState === 'hidden') onFocusLost()
}

function blockEvent(event) {
  event.preventDefault()
}

function attachProctoring() {
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('blur', onFocusLost)
  // Copying the questions out is not the point of the exercise.
  document.addEventListener('copy', blockEvent)
  document.addEventListener('cut', blockEvent)
  document.addEventListener('contextmenu', blockEvent)
}

function detachProctoring() {
  document.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('blur', onFocusLost)
  document.removeEventListener('copy', blockEvent)
  document.removeEventListener('cut', blockEvent)
  document.removeEventListener('contextmenu', blockEvent)
}

function finish(payload) {
  result.value = payload
  phase.value = 'result'
  clearInterval(tickTimer)
  detachProctoring()
  focusWarning.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function choose(questionId, optionIndex) {
  if (phase.value !== 'running') return
  selected[questionId] = optionIndex
}

async function submit({ auto = false } = {}) {
  if (submitting.value || phase.value !== 'running') return
  if (!auto && !allAnswered.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    // An empty auto-submit is valid and still closes the sitting — the
    // server grades it as a zero rather than leaving it open.
    finish(await assessmentsApi.submit(route.params.id, collectAnswers()))
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    submitting.value = false
  }
}

async function retry() {
  result.value = null
  for (const key of Object.keys(selected)) delete selected[key]
  focusLossCount.value = 0
  await loadBriefing()
  if (phase.value !== 'running') phase.value = 'briefing'
}

onMounted(loadBriefing)
onBeforeUnmount(() => {
  clearInterval(tickTimer)
  detachProctoring()
  faceGate.stop()
})
</script>

  <div class="min-h-screen bg-bg pb-12">
    <!-- Fixed rather than absolute: the sitting cannot start behind it, and
         on a long briefing the check must not be somewhere up the page. -->
    <FaceGateOverlay
      v-if="faceGate.active.value"
      v-model:show-enrollment="faceGate.showEnrollment.value"
      full-page
      :state="faceGate.state.value"
      :action="faceGate.action.value"
      :error-message="faceGate.errorMessage.value"
      :stream="faceGate.cameraStream.value"
      @capture="faceGate.capture"
      @enrolled="faceGate.onEnrolled"
    />

    <div v-if="loading" class="mx-auto max-w-6xl px-6 py-8 mt-12 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton class="h-64 w-full rounded-xl" />
    </div>

    <div v-else-if="!briefing" class="mx-auto max-w-3xl px-6 py-12">
      <ErrorState :title="errorMessage || t('assessment.notFound')" @retry="loadBriefing" />
    </div>

    <template v-else>
      <!-- ============ BRIEFING ============ -->
      <template v-if="phase === 'briefing'">
        <!-- Full Width Hero Banner -->
        <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
          <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900"></div>
          <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMnYtNGg0VjRoLTR6TTYuNiAyNy41MmwxLjc2LTMuMy0xLjc2LTMuM0g0LjRsLTEuNzYgMy4zIDEuNzYgMy4zaDIuMnptMjMuNi0xMy4yTDI4LjQ0IDExbDEuNzYtMy4zSDMyLjRsMS43NiAzLjMtMS43NiAzLjNoLTIuMnptMjMuNi0xMy4yTDUyLjA0LS4ybDEuNzYtMy4zSDU2bDEuNzYgMy4zLTEuNzYgMy4zaC0yLjJ6IiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvZz48L3N2Zz4=')]"></div>
          
          <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
            <button
              type="button"
              class="flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white mb-6"
              @click="router.back()"
            >
              <Icon name="chevron-left" size="16" />
              {{ t('common.goBack') }}
            </button>
            
            <div class="flex items-center gap-4 mb-4">
              <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary border border-primary/30 backdrop-blur-sm shadow-inner">
                <Icon name="check-square" size="28" />
              </span>
              <div class="min-w-0">
                <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ briefing.title }}</h1>
              </div>
            </div>
            
            <p v-if="briefing.description" class="mt-3 text-body text-white/80 line-clamp-2 drop-shadow max-w-3xl">{{ briefing.description }}</p>
          </div>
        </div>

        <div class="mx-auto max-w-[1440px] px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div class="lg:col-span-3">

        <AppCard class="mt-6 border border-border shadow-sm">
          <p class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">
            {{ t('assessment.rules.title') }}
          </p>

          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div class="rounded-md border border-border bg-surface-2 px-4 py-3">
              <p class="text-h3 text-ink">{{ briefing.timeLimitMinutes }}</p>
              <p class="mt-0.5 text-caption text-ink-muted">{{ t('assessment.rules.minutes') }}</p>
            </div>
            <div class="rounded-md border border-border bg-surface-2 px-4 py-3">
              <p class="text-h3 text-ink">{{ briefing.questionCount }}</p>
              <p class="mt-0.5 text-caption text-ink-muted">{{ t('assessment.rules.questions') }}</p>
            </div>
            <div class="rounded-md border border-border bg-surface-2 px-4 py-3">
              <p class="text-h3 text-ink">{{ briefing.passScorePercent }}%</p>
              <p class="mt-0.5 text-caption text-ink-muted">{{ t('assessment.rules.passScore') }}</p>
            </div>
          </div>

          <ul class="mt-5 space-y-2.5">
            <li
              v-for="rule in [
                t('assessment.rules.timer', { value: briefing.timeLimitMinutes }),
                t('assessment.rules.tabs'),
                t('assessment.rules.singleSitting'),
                t('assessment.rules.noCopy'),
              ]"
              :key="rule"
              class="flex items-start gap-2.5 text-small text-ink-muted"
            >
              <Icon name="alert-circle" size="15" class="mt-0.5 shrink-0 text-warning" />
              <span>{{ rule }}</span>
            </li>
          </ul>

          <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

          <AppButton class="mt-6" size="lg" icon="play" :loading="starting" @click="start">
            {{ t('assessment.startButton') }}
          </AppButton>
        </AppCard>
          </div>
        </div>
      </template>

      <!-- ============ RUNNING ============ -->
      <template v-else-if="phase === 'running'">
        <div class="mx-auto max-w-3xl px-6 relative">
          <!-- Sticky so the remaining time is never scrolled out of sight -->
          <div class="sticky top-0 z-20 -mx-6 mb-4 border-b border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-small font-semibold text-ink">{{ briefing.title }}</p>
              <p class="text-caption text-ink-muted">
                {{ t('assessment.answered', { answered: answeredCount, total: questionCount }) }}
              </p>
            </div>
            <div class="flex items-center gap-2.5">
              <span
                v-if="focusLossCount > 0"
                class="flex items-center gap-1.5 rounded-md bg-warning-subtle px-2.5 py-1.5 text-caption font-medium text-warning"
              >
                <Icon name="alert-triangle" size="14" />
                {{ t('assessment.focus.counter', { count: focusLossCount, limit: briefing.focusLossLimit }) }}
              </span>
              <span
                class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-semibold tabular-nums"
                :class="timeCritical ? 'bg-danger-subtle text-danger' : 'bg-surface-2 text-ink'"
              >
                <Icon name="clock" size="16" />
                {{ remainingLabel }}
              </span>
            </div>
          </div>
        </div>

        <!-- exam-body carries user-select:none (see the style block) -->
        <AppCard class="exam-body border border-border shadow-sm mt-4">
          <div class="space-y-6">
            <div v-for="(question, qIndex) in assessment.questions" :key="question.id">
              <p class="text-small font-medium text-ink">{{ qIndex + 1 }}. {{ question.text }}</p>
              <div class="mt-2.5 space-y-1.5">
                <label
                  v-for="(option, oIndex) in question.options"
                  :key="option.id"
                  class="flex cursor-pointer items-start gap-2.5 rounded-md border px-4 py-3 text-small transition-default"
                  :class="
                    selected[question.id] === oIndex
                      ? 'border-primary bg-primary/5 text-ink'
                      : 'border-border text-ink-muted hover:bg-surface-2'
                  "
                >
                  <input
                    type="radio"
                    class="mt-0.5"
                    :name="question.id"
                    :checked="selected[question.id] === oIndex"
                    @change="choose(question.id, oIndex)"
                  />
                  <span>{{ option.text }}</span>
                </label>
              </div>
            </div>
          </div>

          <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

          <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p class="text-small text-ink-muted">
              {{ t('assessment.answered', { answered: answeredCount, total: questionCount }) }}
            </p>
            <AppButton :disabled="!allAnswered" :loading="submitting" @click="submit()">
              {{ t('assessment.submit') }}
            </AppButton>
          </div>
        </div>
      </template>

      <!-- ============ RESULT ============ -->
      <template v-else>
        <!-- Full Width Hero Banner -->
        <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
          <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900"></div>
          
          <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
            <button
              type="button"
              class="flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white mb-6"
              @click="router.back()"
            >
              <Icon name="chevron-left" size="16" />
              {{ t('common.goBack') }}
            </button>
            <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md">{{ briefing.title }}</h1>
          </div>
        </div>

        <div class="mx-auto max-w-3xl px-6 py-12">
          <AppCard
            class="border shadow-lg p-8 rounded-xl"
            :class="result.passed ? 'border-success bg-success/5' : 'border-danger bg-danger/5'"
          >
          <div class="flex items-center gap-2">
            <Icon
              :name="result.passed ? 'check-circle' : 'alert-circle'"
              size="24"
              :class="result.passed ? 'text-success' : 'text-danger'"
            />
            <p class="text-h2" :class="result.passed ? 'text-success' : 'text-danger'">
              {{ result.passed ? t('assessment.passed') : t('assessment.failed') }}
            </p>
          </div>

          <p v-if="result.endedReason === 'FOCUS_LOST'" class="mt-2 text-small font-medium text-danger">
            {{ t('assessment.focus.terminated') }}
          </p>
          <p v-else-if="result.endedReason === 'TIME_EXPIRED'" class="mt-2 text-small font-medium text-warning">
            {{ t('assessment.timeUp') }}
          </p>

          <p class="mt-2 text-small text-ink-muted">
            {{ t('assessment.score') }}: {{ result.scorePercent }}%
            ({{ t('assessment.passScore', { value: result.passScorePercent }) }})
          </p>
          <p v-if="result.pointsAwarded > 0" class="mt-1.5 flex items-center gap-1.5 text-small font-medium text-ink">
            <Icon name="award" size="15" />
            +{{ result.pointsAwarded }} {{ t('gamification.points') }}
          </p>

            <div class="mt-6 flex flex-wrap gap-3">
              <AppButton v-if="!result.passed" variant="outline" icon="refresh" @click="retry">
                {{ t('assessment.retry') }}
              </AppButton>
              <AppButton variant="secondary" @click="router.back()">{{ t('assessment.backToCourse') }}</AppButton>
            </div>
          </AppCard>
        </div>
      </template>
    </template>

    <!-- Full-screen warning after the first focus loss. Deliberately modal:
         the point is that it cannot be missed on the way back in. -->
    <Teleport to="body">
      <div
        v-if="focusWarning"
        class="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
      >
        <AppCard class="max-w-md border border-warning shadow-lg">
          <div class="flex items-center gap-2.5">
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-warning/10 text-warning">
              <Icon name="alert-triangle" size="24" />
            </span>
            <p class="text-h2 text-ink">{{ t('assessment.focus.warningTitle') }}</p>
          </div>
          <p class="mt-4 text-small text-ink-muted">
            {{ t('assessment.focus.warningBody', { count: focusLossCount, limit: briefing?.focusLossLimit ?? 2 }) }}
          </p>
          <AppButton class="mt-6" block @click="focusWarning = false">
            {{ t('assessment.focus.warningAck') }}
          </AppButton>
        </AppCard>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Selection is off for the whole running test — questions and options are
   not meant to be copied out. The radio inputs stay interactive; only text
   selection is suppressed. */
.exam-body {
  user-select: none;
  -webkit-user-select: none;
}
</style>
