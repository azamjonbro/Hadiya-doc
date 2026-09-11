<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { assessmentsApi } from '@/services/assessments'
import { useFaceGate } from '@/composables/useFaceGate'
import { useConfirm } from '@/composables/useConfirm'
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
const confirm = useConfirm()

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

// One question on screen at a time (reference §14): "Javob berish" moves
// forward, the last one submits, there is no way back. The index is
// local — the server only ever sees the finished answer sheet, the same
// single `submit` as before.
const currentIndex = ref(0)
const currentQuestion = computed(() => assessment.value?.questions?.[currentIndex.value] ?? null)
const isLast = computed(() => currentIndex.value >= questionCount.value - 1)
const currentAnswered = computed(() => currentQuestion.value && selected[currentQuestion.value.id] !== undefined)

function answer() {
  if (!currentAnswered.value) return
  if (isLast.value) submit()
  else currentIndex.value += 1
}

// A sitting left open is offered back rather than silently resumed: the
// dialog on the reference asks first.
const resumeOffer = ref(false)
async function resume(yes) {
  resumeOffer.value = false
  if (yes) await start()
  else router.back()
}

// The × in the corner. Mid-test it asks — the sitting stays open on the
// server and can be picked up again, but the clock does not stop.
async function close() {
  if (phase.value === 'running') {
    const ok = await confirm({
      title: t('portal.player.leaveTitle'),
      message: t('portal.player.leaveBody'),
      confirmLabel: t('portal.player.leave'),
      danger: true,
    })
    if (!ok) return
  }
  router.back()
}

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
    // A sitting left running (reload, crash, closed laptop) can be resumed
    // rather than restarted — after the person says so.
    if (briefing.value.activeSession) resumeOffer.value = true
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
    // Resume where the sheet was left: the first unanswered question.
    const firstOpen = (data.assessment.questions ?? []).findIndex((q) => selected[q.id] === undefined)
    currentIndex.value = firstOpen === -1 ? 0 : firstOpen
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
  currentIndex.value = 0
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

<template>
  <!-- The player covers the portal (reference §14): a 36px dark bar with
       the test's name and ×, a grey field, one white card in the middle.
       Fixed and above the shell so the navigation is out of reach while a
       sitting runs. -->
  <div class="fixed inset-0 z-[90] flex flex-col bg-[#D9D9D9]">
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

    <div class="flex h-9 shrink-0 items-center justify-between bg-[#2B2B2B] px-3 text-white">
      <p class="truncate text-[13px] font-semibold">{{ briefing?.title ?? t('quiz.title') }}</p>
      <div class="flex items-center gap-3">
        <span
          v-if="phase === 'running' && focusLossCount > 0"
          class="flex items-center gap-1 text-[12px] text-amber-300"
        >
          <Icon name="alert-triangle" size="13" />
          {{ t('assessment.focus.counter', { count: focusLossCount, limit: briefing.focusLossLimit }) }}
        </span>
        <span
          v-if="phase === 'running'"
          class="flex items-center gap-1 text-[12px] tabular-nums"
          :class="timeCritical ? 'text-red-300' : 'text-white/80'"
        >
          <Icon name="clock" size="13" />
          {{ remainingLabel }}
        </span>
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10" :aria-label="t('common.close')" @click="close">
          <Icon name="close" size="16" />
        </button>
      </div>
    </div>

    <div class="flex flex-1 items-center justify-center overflow-auto p-4">
      <div v-if="loading" class="w-full max-w-[984px] space-y-3 rounded bg-surface p-6">
        <Skeleton class="h-6 w-64" />
        <Skeleton class="h-64 w-full rounded" />
      </div>

      <div v-else-if="!briefing" class="w-full max-w-[984px] rounded bg-surface p-6">
        <ErrorState :title="errorMessage || t('assessment.notFound')" @retry="loadBriefing" />
      </div>

      <!-- Resume dialog -->
      <div v-else-if="resumeOffer" class="w-[360px] max-w-full rounded bg-surface p-5 shadow-lg">
        <div class="flex items-start gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="info" size="18" />
          </span>
          <p class="pt-1 text-[13px] text-ink">{{ t('portal.player.resumeQuestion') }}</p>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <AppButton size="sm" :loading="starting" @click="resume(true)">{{ t('portal.player.yes') }}</AppButton>
          <AppButton size="sm" variant="secondary" @click="resume(false)">{{ t('portal.player.no') }}</AppButton>
        </div>
      </div>

      <!-- The card: 984 wide, 560+ tall (rasm 41 — the notes said 720×460) -->
      <div v-else class="flex min-h-[560px] w-full max-w-[984px] flex-col rounded bg-surface p-3 shadow-sm">
        <div class="flex flex-1 flex-col border border-border">
          <!-- ============ BRIEFING ============ -->
          <template v-if="phase === 'briefing'">
            <div class="flex-1 p-6">
              <p class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('assessment.rules.title') }}</p>
              <h2 class="mt-1 text-[20px] font-semibold text-ink">{{ briefing.title }}</h2>
              <p v-if="briefing.description" class="mt-2 text-[13px] text-ink-muted">{{ briefing.description }}</p>

              <div class="mt-5 grid grid-cols-3 gap-3">
                <div class="rounded-md bg-surface-2 px-4 py-3">
                  <p class="text-[20px] font-semibold text-ink">{{ briefing.timeLimitMinutes }}</p>
                  <p class="text-caption text-ink-muted">{{ t('assessment.rules.minutes') }}</p>
                </div>
                <div class="rounded-md bg-surface-2 px-4 py-3">
                  <p class="text-[20px] font-semibold text-ink">{{ briefing.questionCount }}</p>
                  <p class="text-caption text-ink-muted">{{ t('assessment.rules.questions') }}</p>
                </div>
                <div class="rounded-md bg-surface-2 px-4 py-3">
                  <p class="text-[20px] font-semibold text-ink">{{ briefing.passScorePercent }}%</p>
                  <p class="text-caption text-ink-muted">{{ t('assessment.rules.passScore') }}</p>
                </div>
              </div>

              <ul class="mt-5 space-y-2">
                <li
                  v-for="rule in [
                    t('assessment.rules.timer', { value: briefing.timeLimitMinutes }),
                    t('assessment.rules.tabs'),
                    t('assessment.rules.singleSitting'),
                    t('assessment.rules.noCopy'),
                  ]"
                  :key="rule"
                  class="flex items-start gap-2.5 text-[13px] text-ink-muted"
                >
                  <Icon name="alert-circle" size="15" class="mt-0.5 shrink-0 text-warning" />
                  <span>{{ rule }}</span>
                </li>
              </ul>
              <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>
            </div>
            <div class="flex items-center justify-end border-t border-border px-4 py-2.5">
              <AppButton size="sm" icon="play" :loading="starting" @click="start">{{ t('assessment.startButton') }}</AppButton>
            </div>
          </template>

          <!-- ============ RUNNING: one question ============ -->
          <template v-else-if="phase === 'running'">
            <!-- exam-body carries user-select:none (see the style block) -->
            <div v-if="currentQuestion" class="exam-body flex-1 p-6">
              <p class="text-[13px] font-semibold text-ink">{{ t('portal.player.pickOne') }}</p>
              <p class="mt-1 text-[14px] text-ink">{{ currentQuestion.text }}</p>
              <div class="mt-4 space-y-[5px]">
                <label
                  v-for="(option, oIndex) in currentQuestion.options"
                  :key="option.id"
                  class="flex min-h-[36px] cursor-pointer items-center gap-3 border px-3 py-1.5 text-[13px] transition-default"
                  :class="selected[currentQuestion.id] === oIndex ? 'border-[#9DB6EE] bg-[#DCE6FA] text-ink' : 'border-border bg-[#F5F5F5] text-ink hover:bg-surface-2'"
                >
                  <input
                    type="radio"
                    class="accent-[#2F5FCF]"
                    :name="currentQuestion.id"
                    :checked="selected[currentQuestion.id] === oIndex"
                    @change="choose(currentQuestion.id, oIndex)"
                  />
                  <span>{{ option.text }}</span>
                </label>
              </div>
              <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>
            </div>
            <div class="flex items-center justify-end gap-4 border-t border-border px-4 py-2.5">
              <span class="text-[12px] text-ink-muted">{{ t('portal.player.questionOf', { n: currentIndex + 1, total: questionCount }) }}</span>
              <AppButton size="sm" :disabled="!currentAnswered" :loading="submitting" @click="answer">
                {{ isLast ? t('assessment.submit') : t('portal.player.answer') }}
              </AppButton>
            </div>
          </template>

          <!-- ============ RESULT ============ -->
          <template v-else>
            <div class="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <Icon :name="result.passed ? 'check-circle' : 'alert-circle'" size="40" :class="result.passed ? 'text-success' : 'text-danger'" />
              <p class="mt-3 text-[22px] font-semibold" :class="result.passed ? 'text-success' : 'text-danger'">
                {{ result.passed ? t('assessment.passed') : t('assessment.failed') }}
              </p>
              <p v-if="result.endedReason === 'FOCUS_LOST'" class="mt-1 text-[13px] font-medium text-danger">{{ t('assessment.focus.terminated') }}</p>
              <p v-else-if="result.endedReason === 'TIME_EXPIRED'" class="mt-1 text-[13px] font-medium text-warning">{{ t('assessment.timeUp') }}</p>
              <p class="mt-2 text-[13px] text-ink-muted">
                {{ t('assessment.score') }}: {{ result.scorePercent }}% ({{ t('assessment.passScore', { value: result.passScorePercent }) }})
              </p>
              <p v-if="result.pointsAwarded > 0" class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink">
                <Icon name="award" size="15" />
                +{{ result.pointsAwarded }} {{ t('gamification.points') }}
              </p>
            </div>
            <div class="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
              <AppButton v-if="!result.passed" size="sm" variant="outline" icon="refresh" @click="retry">{{ t('assessment.retry') }}</AppButton>
              <AppButton size="sm" variant="secondary" @click="router.back()">{{ t('assessment.backToCourse') }}</AppButton>
            </div>
          </template>
        </div>
      </div>
    </div>

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
