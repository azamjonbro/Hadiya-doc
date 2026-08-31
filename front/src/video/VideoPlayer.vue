<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Hls from 'hls.js'
import { ATTENTION_EVENTS } from '@lms/shared'
import { proctorApi } from '@/services/proctor'
import { useAuthStore } from '@/stores/auth'
import { videoAccessApi } from '@/services/videoAccess'
import { API_BASE_URL } from '@/services/apiBase'
import { coursesApi } from '@/services/courses'
import { useVideoAnalytics } from '@/composables/useVideoAnalytics'
import { useAttentionMonitor } from '@/composables/useAttentionMonitor'
import { useFaceGate } from '@/composables/useFaceGate'
import AttentionOverlay from './AttentionOverlay.vue'
import FaceGateOverlay from '@/components/face/FaceGateOverlay.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({
  videoId: { type: String, required: true },
  // Needed only to resolve the attention policy; playback itself is
  // authorized per-video by the streaming token.
  courseId: { type: String, default: '' },
})
const emit = defineEmits(['timeupdate', 'ready', 'ended'])

const { t } = useI18n()
const auth = useAuthStore()
const videoEl = ref(null)
const errorMessage = ref('')
const now = ref(new Date())
const ready = ref(false)

// Deterrent only, never a security boundary (spec §2) — the real
// authorization is the per-segment token re-validated on every request by
// the backend. Repositioning periodically makes cropping the watermark out
// of a leaked recording harder.
const WATERMARK_POSITIONS = ['bottom-2 right-2', 'top-2 left-2', 'bottom-2 left-2', 'top-2 right-2']
const positionIndex = ref(0)

const analytics = useVideoAnalytics(props.videoId)

// ---------------------------------------------------------------------------
// Camera attention monitoring
//
// The player owns every decision here; useAttentionMonitor only reports
// "attentive / not", and AttentionOverlay only draws what it is told. The
// policy comes from the server so a learner cannot soften their own rules by
// editing anything in this file's reach.
// ---------------------------------------------------------------------------
const monitor = useAttentionMonitor()
const policy = ref(null)
const consented = ref(false)
const pausedByPolicy = ref(false)
const warningCount = ref(0)
const lockoutRemaining = ref(0)
let lockoutTimer = null

const monitoringOn = computed(() => Boolean(policy.value?.enabled))
const faceGateActive = computed(() => faceGate.active.value)

const overlayState = computed(() => {
  // The face gate blocks before a playback token even exists — nothing
  // attention-related has anything to show yet either way.
  if (faceGateActive.value) return null
  if (!monitoringOn.value) return null
  if (!consented.value) return 'consent'
  if (monitor.status.value === 'denied') return 'denied'
  if (monitor.status.value === 'error') return 'error'
  if (lockoutRemaining.value > 0) return 'lockout'
  if (monitor.status.value === 'loading') return 'loading'
  if (monitor.status.value === 'calibrating') return 'calibrating'
  if (!monitor.attentive.value) return 'warning'
  return null
})

// Playback is held while the learner has not consented yet, while the camera
// is being set up, and for the whole lockout — anything the overlay covers
// completely. The face gate blocks unconditionally: there is no token to
// play against until it passes.
const playbackBlocked = computed(
  () => faceGateActive.value || ['consent', 'denied', 'error', 'lockout'].includes(overlayState.value)
)

function startLockout() {
  const seconds = policy.value?.lockoutSeconds ?? 20
  lockoutRemaining.value = seconds
  analytics.track(ATTENTION_EVENTS.LOCKOUT, {
    position: videoEl.value?.currentTime ?? null,
    duration: seconds,
  })
  videoEl.value?.pause()
  clearInterval(lockoutTimer)
  lockoutTimer = setInterval(() => {
    lockoutRemaining.value -= 1
    if (lockoutRemaining.value > 0) return
    clearInterval(lockoutTimer)
    lockoutTimer = null
    // The counter resets so the next lockout needs a fresh run of warnings
    // rather than triggering on every single lapse from here on.
    warningCount.value = 0
  }, 1000)
}

function onAttentionLost({ reason, position }) {
  analytics.track(ATTENTION_EVENTS.LOST, { position, metadata: { reason } })
  analytics.track(ATTENTION_EVENTS.WARNING_SHOWN, { position, metadata: { reason } })
  warningCount.value += 1

  if (policy.value?.pauseOnWarning && videoEl.value && !videoEl.value.paused) {
    pausedByPolicy.value = true
    videoEl.value.pause()
  }

  const limit = policy.value?.lockoutAfterWarnings ?? 0
  if (limit > 0 && warningCount.value >= limit) startLockout()
}

function onAttentionRegained({ seconds, fromPosition, toPosition }) {
  analytics.track(ATTENTION_EVENTS.REGAINED, {
    position: toPosition,
    duration: seconds,
    // The server cuts exactly this range back out of the watched segments.
    metadata: { fromPosition, toPosition },
  })
  // A lockout has to run its course; attention coming back does not end it.
  if (pausedByPolicy.value && lockoutRemaining.value === 0) {
    pausedByPolicy.value = false
    videoEl.value?.play().catch(() => {})
  }
}

// A second person on camera. Recorded either way; the photograph only exists
// when the course asked for one, and a failed upload is swallowed on purpose —
// losing a lesson because an alert could not be filed would be the worse
// outcome, and the analytics event has already been queued regardless.
async function onForeignFace({ reason, faceCount, snapshot }) {
  const position = videoEl.value?.currentTime ?? null
  analytics.track(ATTENTION_EVENTS.FOREIGN_FACE, { position, metadata: { reason, faceCount } })

  const blob = await snapshot
  if (!blob) return
  try {
    await proctorApi.captureSnapshot(props.videoId, {
      blob,
      reason,
      sessionId: analytics.sessionId,
      position,
      faceCount,
    })
  } catch {
    /* nothing the learner can do about it, and nothing worth interrupting for */
  }
}

async function startMonitoring() {
  const started = await monitor.start({
    videoEl: videoEl.value,
    graceSeconds: policy.value?.graceSeconds ?? 4,
    // Keep sampling through a policy-imposed pause, or the learner coming
    // back would never be noticed; stay quiet through a pause they chose.
    isActive: () => Boolean(videoEl.value && (!videoEl.value.paused || pausedByPolicy.value)),
    captureOnForeignFace: Boolean(policy.value?.captureOnForeignFace),
    on: {
      lost: onAttentionLost,
      regained: onAttentionRegained,
      foreignFace: onForeignFace,
      denied: () => analytics.track(ATTENTION_EVENTS.CAMERA_DENIED),
      error: ({ message }) => analytics.track(ATTENTION_EVENTS.CAMERA_ERROR, { metadata: { message } }),
    },
  })
  return started
}

async function onConsent() {
  consented.value = true
  await startMonitoring()
}

async function onRetryCamera() {
  consented.value = true
  await startMonitoring()
}

// ---------------------------------------------------------------------------
// Face verification gate
//
// Separate from attention monitoring above on purpose (spec: "is this the
// enrolled employee" vs. "did someone else appear during the lesson" are
// different questions, answered by different systems — see
// docs/face-verification.md). Blocks *before* a playback token even exists:
// issueToken() 403s until the check passes, so nothing here trusts a
// client-side flag. The same gate stands in front of materials and tests;
// the state machine lives in useFaceGate.js, shared by all three.
// ---------------------------------------------------------------------------
const faceGate = useFaceGate(() => setup())

let hls = null
let currentToken = null
let tokenRefreshTimer = null
let clockTimer = null
let positionTimer = null

function apiBase() {
  return API_BASE_URL
}

function manifestUrl(token) {
  return `${apiBase()}/video-stream/${props.videoId}/master.m3u8?token=${token}`
}

// `renew` carries the token in hand, which is what keeps a lesson already
// playing from being stopped by the face check on its two-minute refresh.
async function fetchToken({ renew = false } = {}) {
  const { token } = await videoAccessApi.issueToken(props.videoId, renew ? currentToken : '')
  currentToken = token
  return token
}

async function setup() {
  try {
    const token = await fetchToken()

    if (Hls.isSupported()) {
      hls = new Hls({
        // The manifest is fetched once (VOD), so segment URLs carry the
        // token from that fetch — this swaps in whatever token is current
        // at request time so playback survives past the original token's
        // TTL on longer videos.
        xhrSetup: (xhr, url) => {
          const rewritten = new URL(url)
          if (rewritten.searchParams.has('token') && currentToken) {
            rewritten.searchParams.set('token', currentToken)
          }
          xhr.open('GET', rewritten.toString(), true)
        },
      })
      hls.loadSource(manifestUrl(token))
      hls.attachMedia(videoEl.value)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) errorMessage.value = data.details ?? 'Playback error'
      })
    } else if (videoEl.value.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.value.src = manifestUrl(token)
    } else {
      errorMessage.value = 'HLS playback is not supported in this browser'
    }

    tokenRefreshTimer = setInterval(() => {
      fetchToken({ renew: true }).catch(() => {})
    }, 120_000)

    analytics.attach(videoEl.value)
    // Last line of defence for the blocking states: the overlay covers the
    // controls, but a keyboard shortcut or the media keys can still reach the
    // element, so any play that slips through is undone here.
    videoEl.value.addEventListener('play', () => {
      if (playbackBlocked.value) videoEl.value.pause()
    })
    videoEl.value.addEventListener('loadeddata', () => {
      ready.value = true
      emit('ready')
    })
    videoEl.value.addEventListener('timeupdate', () => {
      emit('timeupdate', { currentTime: videoEl.value.currentTime, duration: videoEl.value.duration || 0 })
    })
    videoEl.value.addEventListener('ended', () => emit('ended'))
  } catch (error) {
    // Hold the gate open, wizard included: playbackBlocked follows
    // faceGate.active, so nothing plays while it is up. setup() runs again
    // by itself once the check passes.
    if (faceGate.claim(error)) return
    errorMessage.value = apiErrorText(error)
  }
}

async function loadPolicy() {
  if (!props.courseId) {
    console.warn('[attention] no courseId passed to VideoPlayer — monitoring cannot be resolved')
    return
  }
  try {
    policy.value = await coursesApi.attentionPolicy(props.courseId)
    console.info('[attention] policy loaded', policy.value)
  } catch (error) {
    // A policy that cannot be read is not a reason to withhold the lesson —
    // the video plays unmonitored and the failure stays out of the learner's
    // way. It is still logged, because "monitoring silently never started" is
    // otherwise indistinguishable from "monitoring found nothing wrong".
    console.warn('[attention] policy could not be loaded, playing unmonitored', error)
    policy.value = null
  }
}

onMounted(() => {
  setup()
  loadPolicy()
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  positionTimer = setInterval(() => {
    positionIndex.value = (positionIndex.value + 1) % WATERMARK_POSITIONS.length
  }, 8000)
})

onBeforeUnmount(() => {
  // Before analytics.detach(), which does the final flush — a pending
  // inattentive stretch has to be on the buffer by then or it is lost.
  if (!monitor.attentive.value) {
    analytics.track(ATTENTION_EVENTS.REGAINED, {
      position: videoEl.value?.currentTime ?? null,
      duration: 0,
      metadata: { fromPosition: videoEl.value?.currentTime ?? null, toPosition: videoEl.value?.currentTime ?? null, partial: true },
    })
  }
  monitor.stop()
  faceGate.stop()
  clearInterval(lockoutTimer)
  analytics.detach()
  hls?.destroy()
  clearInterval(tokenRefreshTimer)
  clearInterval(clockTimer)
  clearInterval(positionTimer)
})
</script>

<template>
  <div class="relative overflow-hidden rounded-lg bg-black">
    <div v-if="!ready" class="absolute inset-0 z-10 flex aspect-video w-full items-center justify-center bg-surface-2">
      <Icon name="loader" size="28" class="animate-spin text-ink-faint" />
    </div>
    <video ref="videoEl" controls class="aspect-video w-full" />
    <div
      class="pointer-events-none absolute select-none rounded bg-black/40 px-2 py-1 font-mono text-[10px] leading-tight text-white/70"
      :class="WATERMARK_POSITIONS[positionIndex]"
    >
      {{ auth.user?.fullName }} · {{ auth.user?.id?.slice(-6) }} · Corporate LMS · {{ now.toLocaleString() }}
    </div>

    <!-- Persistent, non-dismissable badge whenever the camera is live. A
         learner should never have to wonder whether they are being monitored
         right now. -->
    <div
      v-if="monitor.status.value === 'watching' || monitor.status.value === 'calibrating'"
      class="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur-sm"
    >
      <span class="h-1.5 w-1.5 rounded-full bg-danger" :class="monitor.attentive.value ? '' : 'animate-pulse'" />
      {{ t('attention.badge') }}
    </div>

    <AttentionOverlay
      v-if="overlayState"
      :state="overlayState"
      :reason="monitor.reason.value"
      :lockout-remaining="lockoutRemaining"
      :error-message="monitor.errorMessage.value"
      @accept="onConsent"
      @retry="onRetryCamera"
    />

    <!-- Face check — blocks before any playback token exists, so it takes
         priority over everything else the player might otherwise show. -->
    <FaceGateOverlay
      v-if="faceGateActive"
      v-model:show-enrollment="faceGate.showEnrollment.value"
      :state="faceGate.state.value"
      :action="faceGate.action.value"
      :error-message="faceGate.errorMessage.value"
      :stream="faceGate.cameraStream.value"
      @capture="faceGate.capture"
      @enrolled="faceGate.onEnrolled"
    />

    <p v-if="errorMessage" class="p-2 text-sm text-red-400">{{ errorMessage }}</p>
  </div>
</template>
