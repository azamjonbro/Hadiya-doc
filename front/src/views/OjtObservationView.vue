<script setup>
/**
 * The form an observer fills in standing next to somebody working (13.3).
 *
 * **It has to work with no network, and it has to be honest about it.**
 * This is used in a workshop, a basement, a lift shaft; the old shape of
 * this failure — `fetch(...).catch(() => {})` — silently threw away an
 * afternoon of verdicts, which is exactly what the offline queue (12.3)
 * exists to stop. So a verdict that cannot reach the API is written to the
 * queue and the step is marked "not sent yet" on screen until it goes.
 *
 * Why that is safe to replay: the queue entry is keyed
 * `ojt-observation:<session>:<item>` and the API call is a PUT on the same
 * pair, which the server upserts on `(sessionId, itemId)`. One key per step
 * means a second verdict on the same step *replaces* the queued one instead
 * of stacking a second answer behind it, and a replay after a reconnect
 * lands on the same row and changes nothing — the score cannot double-count.
 *
 * What is **not** queued: complete, sign-off and cancel. They are decisions
 * a person watches happen, not background telemetry, and sign-off writes
 * levels into somebody's skill matrix — replaying that from a queue days
 * later, against a session whose state has moved on, is not a trade worth
 * making. Offline they fail loudly and are tried again on purpose.
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ojtApi } from '@/services/ojt'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useOfflineQueue } from '@/composables/useOfflineQueue'
import { enqueue, onQueueChange } from '@/offline/queue'
import { STORES, idb, isOfflineStorageAvailable } from '@/offline/db'
import { apiErrorText } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const confirm = useConfirm()
const { flush } = useOfflineQueue()

const sessionId = String(route.params.sessionId)
const QUEUE_PREFIX = `ojt-observation:${sessionId}:`

const session = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const acting = ref('')
// itemId → the verdict currently being sent for it, so only the button that
// was pressed spins and the other two go quiet.
const inFlight = reactive({})
// itemId → note being typed. Kept apart from the session object so a silent
// reload cannot wipe half-typed text.
const notes = reactive({})
// The session-level note: what completing or cancelling writes, and what a
// signature is filed with. Separate boxes, because they are separate acts.
const sessionNote = ref('')
const signOffNote = ref('')
// itemId → the queued body, for the steps the server has not heard yet.
const queued = ref(new Map())

const VERDICTS = ['PASS', 'FAIL']

const isObserver = computed(() => session.value?.observerId === auth.user?.id)
const canManage = computed(() => auth.hasPermission('ojt:manage'))
const isOpen = computed(() => session.value?.status === 'SCHEDULED' || session.value?.status === 'IN_PROGRESS')
const canRecord = computed(() => Boolean(isObserver.value && isOpen.value))
const canSignOff = computed(
  () => session.value?.status === 'COMPLETED' && !session.value?.signedAt && (isObserver.value || canManage.value)
)

/**
 * The running total, computed here and not read back from the server.
 *
 * It mirrors `computeScore` in ojt.service.js — what was not observed stays
 * out of the fraction, a required step that is not a PASS means the session
 * cannot pass — because on this screen the arithmetic has to move the moment
 * a button is pressed, and a round trip is the one thing a basement cannot
 * provide. The server stays authoritative: it recomputes and freezes the
 * score on completion, and that is the number the record keeps.
 */
const progress = computed(() => {
  const items = session.value?.items ?? []
  let passed = 0
  let failed = 0
  let notObserved = 0
  let assessedWeight = 0
  let earnedWeight = 0
  let requiredPending = 0

  for (const item of items) {
    const weight = item.weight ?? 1
    if (item.result === 'PASS') {
      passed += 1
      assessedWeight += weight
      earnedWeight += weight
    } else if (item.result === 'FAIL') {
      failed += 1
      assessedWeight += weight
    } else if (item.result === 'NOT_OBSERVED') {
      notObserved += 1
    }
    // Completion is refused while a required step is unanswered or answered
    // "not observed" — the server says so, and the button says so first.
    if (item.required !== false && item.result !== 'PASS' && item.result !== 'FAIL') requiredPending += 1
  }

  const answered = passed + failed + notObserved
  return {
    answered,
    total: items.length,
    passed,
    failed,
    notObserved,
    requiredPending,
    percent: assessedWeight > 0 ? Math.round((earnedWeight / assessedWeight) * 100) : 0,
  }
})

const statusVariant = {
  SCHEDULED: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

/** The verdicts sitting in the offline queue for this session. */
async function readQueued() {
  if (!isOfflineStorageAvailable()) return new Map()
  try {
    const rows = await idb.getAll(STORES.queue)
    return new Map(
      rows
        .filter((row) => typeof row?.id === 'string' && row.id.startsWith(QUEUE_PREFIX))
        .map((row) => [row.id.slice(QUEUE_PREFIX.length), row.body])
    )
  } catch {
    // Storage refused (private window): nothing is queued, because nothing
    // could be queued.
    return new Map()
  }
}

/**
 * Draws what the observer recorded, not only what the server has stored.
 *
 * A reload while the queue is still full would otherwise show the steps as
 * unanswered — the person would record them a second time, and the honest
 * answer is "you did answer, it has not gone yet".
 */
async function syncQueued() {
  queued.value = await readQueued()
  for (const item of session.value?.items ?? []) {
    const body = queued.value.get(item.itemId)
    if (body) {
      item.result = body.result
      if (!notes[item.itemId]) notes[item.itemId] = body.note ?? ''
    }
  }
}

async function load({ silent = false } = {}) {
  if (!silent) {
    loading.value = true
    errorMessage.value = ''
  }
  try {
    const data = await ojtApi.session(sessionId)
    session.value = data
    for (const item of data.items) {
      if (notes[item.itemId] === undefined) notes[item.itemId] = item.note ?? ''
    }
    await syncQueued()
  } catch (error) {
    // A silent refresh that fails leaves the screen as it was: it is a
    // background reconciliation, not something the observer asked for.
    if (!silent) errorMessage.value = apiErrorText(error, t('ojt.loadError'))
  } finally {
    if (!silent) loading.value = false
  }
}

async function record(item, result) {
  if (!canRecord.value || inFlight[item.itemId]) return

  const previous = item.result
  const body = {
    result,
    note: (notes[item.itemId] ?? '').trim(),
    // Stamped by the phone: a verdict given at 09:40 underground must not
    // read as 11:15 in the car park when the queue finally drains.
    recordedAt: new Date().toISOString(),
  }

  item.result = result
  inFlight[item.itemId] = result
  try {
    await ojtApi.recordObservation(sessionId, item.itemId, body)
    if (queued.value.has(item.itemId)) {
      /**
       * There was an older, unsent verdict for this step and it has just
       * been overtaken. Left in the queue it would replay later and
       * overwrite the answer that did reach the server — the one case where
       * an idempotent replay is still wrong, because the *body* is stale.
       */
      await idb.del(STORES.queue, `${QUEUE_PREFIX}${item.itemId}`)
      // Dropped from the local view *before* the queue change is announced:
      // the watcher below compares what left the queue against what the
      // server holds, and an entry replaced on purpose is not a refusal.
      const rest = new Map(queued.value)
      rest.delete(item.itemId)
      queued.value = rest
      // Deleting a row does not itself announce the new queue size; the
      // flush does, and it also sends anything else waiting.
      await flush()
    }
    if (session.value?.status === 'SCHEDULED') session.value.status = 'IN_PROGRESS'
  } catch (error) {
    if (!error?.response) {
      const stored = await enqueue({
        id: `${QUEUE_PREFIX}${item.itemId}`,
        url: ojtApi.observationPath(sessionId, item.itemId),
        method: 'PUT',
        body,
        kind: 'OJT_OBSERVATION',
      })
      if (stored) {
        await syncQueued()
        toast.info(t('ojt.queuedOne'))
        return
      }
      // Nowhere to keep it. The verdict is genuinely lost, so the screen
      // shows it as unanswered rather than pretending.
      item.result = previous
      toast.error(t('ojt.notQueued'))
      return
    }
    // The server answered and refused — a completed session, the wrong
    // observer. Its sentence is the useful one.
    item.result = previous
    toast.error(apiErrorText(error, t('ojt.recordFailed')))
  } finally {
    delete inFlight[item.itemId]
  }
}

/**
 * The note is part of the verdict, not a second record: the PUT is a full
 * replacement, so saving a note means sending the verdict again with the new
 * text. Nothing to send before a verdict exists.
 */
function saveNote(item) {
  if (!item.result) return
  record(item, item.result)
}

async function start() {
  acting.value = 'start'
  try {
    session.value = { ...session.value, ...(await ojtApi.startSession(sessionId)) }
    await load({ silent: true })
    toast.success(t('ojt.sessionStarted'))
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    acting.value = ''
  }
}

async function complete() {
  if (
    !(await confirm.ask({
      title: t('ojt.completeConfirmTitle'),
      message: t('ojt.completeConfirmMessage'),
      confirmLabel: t('ojt.complete'),
    }))
  )
    return
  acting.value = 'complete'
  try {
    await ojtApi.completeSession(sessionId, { note: sessionNote.value.trim() })
    toast.success(t('ojt.completed'))
    await load({ silent: false })
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    acting.value = ''
  }
}

async function signOff() {
  // The dialog names what the signature does, because it is the one action
  // here that reaches outside this session: it writes levels into the
  // trainee's competency matrix and is audited.
  if (
    !(await confirm.ask({
      title: t('ojt.signOffConfirmTitle'),
      message: t('ojt.signOffConfirmMessage'),
      confirmLabel: t('ojt.signOff'),
    }))
  )
    return
  acting.value = 'sign'
  try {
    await ojtApi.signOff(sessionId, { note: signOffNote.value.trim() })
    toast.success(t('ojt.signedOff'))
    await load({ silent: false })
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    acting.value = ''
  }
}

async function cancelSession() {
  if (
    !(await confirm.ask({
      title: t('ojt.cancelConfirmTitle'),
      message: t('ojt.cancelConfirmMessage'),
      confirmLabel: t('ojt.cancelSession'),
    }))
  )
    return
  acting.value = 'cancel'
  try {
    await ojtApi.cancelSession(sessionId, { reason: sessionNote.value.trim() })
    toast.success(t('ojt.cancelled'))
    await load({ silent: false })
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    acting.value = ''
  }
}

let stopWatchingQueue = null

onMounted(async () => {
  await load()
  stopWatchingQueue = onQueueChange(async () => {
    const departed = new Map(queued.value)
    await syncQueued()
    if (!departed.size || queued.value.size) return

    // Everything of ours has gone out. The server now holds verdicts this
    // screen only had locally, so take its version — including the score.
    await load({ silent: true })

    /**
     * A queued request the server *refused* (the session was completed by
     * somebody else, the permission was withdrawn) is a 4xx, and the queue
     * drops those rather than retrying forever — correctly, but silently.
     * Comparing what went out against what came back is the only way this
     * screen can tell, and letting an observer believe a verdict was filed
     * when it was thrown away is the failure this whole path exists to
     * prevent.
     */
    const refused = [...departed].filter(
      ([itemId, body]) => session.value?.items.find((item) => item.itemId === itemId)?.result !== body.result
    )
    if (refused.length) toast.error(t('ojt.pendingRejected', { count: refused.length }))
  })
})

onUnmounted(() => stopWatchingQueue?.())
</script>

<template>
  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')]"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
        <button
          type="button"
          class="mb-6 flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white"
          @click="router.push({ name: 'ojt-sessions' })"
        >
          <Icon name="arrow-left" size="16" />
          {{ t('ojt.backToSessions') }}
        </button>
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md" v-if="session">{{ session.traineeName }}</h1>
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md" v-else>{{ t('ojt.title') }}</h1>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">
      <div class="mx-auto max-w-4xl">
      <div v-if="loading" class="space-y-3">
      <Skeleton class="h-28 w-full rounded-lg" />
      <Skeleton v-for="n in 3" :key="n" class="h-36 w-full rounded-lg" />
    </div>

    <ErrorState v-else-if="errorMessage" class="mt-6" :title="t('ojt.loadError')" :description="errorMessage">
      <template #actions>
        <AppButton variant="secondary" icon="refresh" @click="load()">{{ t('common.retry') }}</AppButton>
      </template>
    </ErrorState>

    <template v-else-if="session">
      <!-- Summary. Sticky so the running total and the "not sent" count stay
           visible while a long checklist is scrolled one-handed. -->
      <AppCard class="sticky top-2 z-10 mt-3 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="min-w-0 flex-1 truncate text-h3 text-ink">{{ session.traineeName }}</h1>
          <Badge :variant="statusVariant[session.status]" size="sm">
            {{ t(`ojt.sessionStatus.${session.status}`) }}
          </Badge>
          <Badge v-if="session.outcome" :variant="session.outcome === 'PASS' ? 'success' : 'danger'" size="sm">
            {{ t(`ojt.outcome.${session.outcome}`) }}
          </Badge>
          <Badge v-if="session.signedAt" variant="primary" size="sm">{{ t('ojt.signedShort') }}</Badge>
        </div>

        <p class="mt-1 truncate text-small text-ink-muted">
          {{ session.checklistName }} · {{ t('ojt.versionLabel', { version: session.checklistVersion }) }}
          <span v-if="session.location"> · {{ session.location }}</span>
        </p>

        <ProgressBar class="mt-3" :value="progress.total ? (progress.answered / progress.total) * 100 : 0" />
        <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-ink-faint">
          <span>{{ t('ojt.observedCount', { done: progress.answered, total: progress.total }) }}</span>
          <span>{{ t('ojt.percentOfAssessed', { percent: progress.percent }) }}</span>
          <span>{{ t('ojt.thresholdShort', { percent: session.passThresholdPercent }) }}</span>
          <span v-if="progress.requiredPending" class="text-warning">
            {{ t('ojt.requiredRemaining', { count: progress.requiredPending }) }}
          </span>
        </p>
      </AppCard>

      <!-- What has not reached the server yet, said plainly. -->
      <div
        v-if="queued.size"
        class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2.5 text-small text-warning"
      >
        <Icon name="wifi-off" size="15" />
        <span class="min-w-0 flex-1">
          {{ t('ojt.pendingCount', { count: queued.size }) }}
          <span class="block text-caption opacity-90">{{ t('ojt.pendingHint') }}</span>
        </span>
        <AppButton variant="secondary" size="sm" icon="refresh" @click="flush()">{{ t('ojt.sendNow') }}</AppButton>
      </div>

      <p v-if="!isObserver" class="mt-3 text-small text-ink-muted">{{ t('ojt.notObserverHint') }}</p>
      <p v-else-if="!isOpen" class="mt-3 text-small text-ink-muted">{{ t('ojt.closedHint') }}</p>

      <AppButton
        v-if="isObserver && session.status === 'SCHEDULED'"
        class="mt-3"
        size="lg"
        block
        icon="play"
        :loading="acting === 'start'"
        @click="start"
      >
        {{ t('ojt.start') }}
      </AppButton>

      <!-- One card per step, big enough to press without looking. -->
      <div class="mt-3 space-y-3">
        <AppCard v-for="(item, index) in session.items" :key="item.itemId" class="p-4">
          <div class="flex items-start gap-2">
            <span class="mt-0.5 w-5 shrink-0 text-caption text-ink-faint">{{ index + 1 }}.</span>
            <div class="min-w-0 flex-1">
              <p class="text-body font-medium text-ink">{{ item.title }}</p>
              <p v-if="item.criteria" class="mt-1 text-small text-ink-muted">{{ item.criteria }}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge v-if="item.required" variant="neutral" size="sm">{{ t('ojt.required') }}</Badge>
                <Badge v-if="queued.has(item.itemId)" variant="warning" size="sm">
                  {{ t('ojt.pendingBadge') }}
                </Badge>
                <span v-if="item.observedAt" class="text-caption text-ink-faint">
                  {{ formatDateTime(item.observedAt, locale) }}
                </span>
              </div>
            </div>
          </div>

          <div class="mt-3" role="group" :aria-label="t('ojt.verdictFor', { title: item.title })">
            <div class="grid grid-cols-2 gap-2">
              <AppButton
                v-for="verdict in VERDICTS"
                :key="verdict"
                size="lg"
                block
                :variant="item.result === verdict ? (verdict === 'FAIL' ? 'danger' : 'primary') : 'secondary'"
                :icon="item.result === verdict ? 'check' : ''"
                :aria-pressed="item.result === verdict"
                :disabled="!canRecord"
                :loading="inFlight[item.itemId] === verdict"
                @click="record(item, verdict)"
              >
                {{ t(`ojt.verdict.${verdict}`) }}
              </AppButton>
            </div>
            <AppButton
              class="mt-2"
              size="lg"
              block
              :variant="item.result === 'NOT_OBSERVED' ? 'primary' : 'secondary'"
              :icon="item.result === 'NOT_OBSERVED' ? 'check' : ''"
              :aria-pressed="item.result === 'NOT_OBSERVED'"
              :disabled="!canRecord"
              :loading="inFlight[item.itemId] === 'NOT_OBSERVED'"
              @click="record(item, 'NOT_OBSERVED')"
            >
              {{ t('ojt.verdict.NOT_OBSERVED') }}
            </AppButton>
            <p v-if="item.result === 'NOT_OBSERVED'" class="mt-1.5 text-caption text-ink-faint">
              {{ t('ojt.notObservedHint') }}
            </p>
          </div>

          <!-- The note travels with the verdict (the PUT replaces the whole
               record), so it is only worth showing once there is one. -->
          <AppInput
            v-if="item.result || notes[item.itemId]"
            v-model="notes[item.itemId]"
            class="mt-3"
            :aria-label="t('ojt.note')"
            :placeholder="t('ojt.notePlaceholder')"
            :disabled="!canRecord"
            @change="saveNote(item)"
          />
        </AppCard>
      </div>

      <!-- Closing the session. Separate acts, separate buttons. -->
      <AppCard class="mt-4 p-4">
        <template v-if="isOpen">
          <label :for="`ojt-note-${sessionId}`" class="mb-1.5 block text-small font-medium text-ink">
            {{ t('ojt.observerNote') }}
          </label>
          <textarea
            :id="`ojt-note-${sessionId}`"
            v-model="sessionNote"
            rows="3"
            :disabled="!isObserver && !canManage"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />

          <div class="mt-3 flex flex-wrap gap-2">
            <AppButton
              v-if="isObserver"
              size="lg"
              icon="check-check"
              :disabled="progress.requiredPending > 0"
              :loading="acting === 'complete'"
              @click="complete"
            >
              {{ t('ojt.complete') }}
            </AppButton>
            <AppButton
              v-if="canManage"
              variant="ghost"
              size="lg"
              icon="close"
              :loading="acting === 'cancel'"
              @click="cancelSession"
            >
              {{ t('ojt.cancelSession') }}
            </AppButton>
          </div>
          <p v-if="progress.requiredPending" class="mt-2 text-caption text-warning">
            {{ t('ojt.requiredRemaining', { count: progress.requiredPending }) }}
          </p>
        </template>

        <template v-else-if="canSignOff">
          <label :for="`ojt-sign-${sessionId}`" class="mb-1.5 block text-small font-medium text-ink">
            {{ t('ojt.signOffNote') }}
          </label>
          <textarea
            :id="`ojt-sign-${sessionId}`"
            v-model="signOffNote"
            rows="3"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <p class="mt-2 text-caption text-ink-faint">{{ t('ojt.signOffConfirmMessage') }}</p>
          <AppButton class="mt-3" size="lg" icon="award" :loading="acting === 'sign'" @click="signOff">
            {{ t('ojt.signOff') }}
          </AppButton>
        </template>

        <template v-else>
          <p v-if="session.signedAt" class="text-small text-ink">
            {{ t('ojt.signedAt', { date: formatDateTime(session.signedAt, locale) }) }}
          </p>
          <p v-if="session.postedCompetencies?.length" class="mt-1 text-caption text-ink-faint">
            {{ t('ojt.postedCompetencies', { count: session.postedCompetencies.length }) }}
          </p>
          <p v-if="session.observerNote" class="mt-2 text-small text-ink-muted">{{ session.observerNote }}</p>
          <p v-if="!session.signedAt && !session.observerNote" class="text-small text-ink-muted">
            {{ t('ojt.closedHint') }}
          </p>
        </template>
      </AppCard>
    </template>
      </div>
    </div>
  </div>
</template>
