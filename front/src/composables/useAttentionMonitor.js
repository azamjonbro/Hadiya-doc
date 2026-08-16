import { ref, shallowRef } from 'vue'
import { ATTENTION_REASONS, FOREIGN_FACE_COOLDOWN_MS } from '@lms/shared'

/**
 * Camera-based attention monitoring for video playback.
 *
 * PRIVACY: attention analysis happens in this tab and every frame it looks at
 * is discarded immediately. For attention, the only thing that leaves the
 * browser is "attentive / not attentive, and why", as ordinary analytics
 * events. The wasm runtime and the model are served from this origin, so no
 * frame-adjacent request reaches a third party either.
 *
 * THE ONE EXCEPTION is the foreign-face check: when a course has
 * `captureOnForeignFace` switched on AND a second face actually appears, one
 * frame is drawn to a canvas and uploaded so an admin can see what happened.
 * It is off by default, it is per-course, and it fires at most once per
 * FOREIGN_FACE_COOLDOWN_MS — nothing is captured on an ordinary lapse of
 * attention. The learner is told this is happening by the player's overlay.
 */

// Assets are served from front/public — see scripts/fetch-mediapipe-assets.mjs.
// Deliberately not a CDN: a proctoring feature that silently stops working
// when someone else's host is down is worse than one that never shipped.
const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/face_landmarker.task'

// Two cadences, because the two phases want opposite things.
//
// Calibration is a one-off wait the learner sits through, so it runs fast
// (~7 fps) and is over in a few seconds. Steady-state monitoring runs for the
// whole lesson, and face landmark inference is the most expensive thing on the
// page — at ~3 fps it costs less than half as much CPU while still measuring a
// multi-second grace period from plenty of real samples.
const CALIBRATION_INTERVAL_MS = 140
const SAMPLE_INTERVAL_MS = 300

// How far the head may turn from the learner's own baseline before it counts
// as looking away, in radians (~28° / ~22°). Generous on purpose: this fires
// automatic warnings, so false positives cost more than missed glances.
const YAW_LIMIT = 0.49
const PITCH_LIMIT = 0.38

// Blendshape strength at which the eyes are clearly pointed off-screen even
// though the head still faces forward.
const GAZE_LIMIT = 0.62

// Frames of head pose averaged into the baseline before monitoring starts.
// Everyone sits at a different angle to their webcam, so "looking at the
// screen" is measured against where this person's head actually rests, never
// against an absolute zero that only suits a centred desktop camera.
const CALIBRATION_FRAMES = 25

// Calibration collects frames only while a face is actually visible, so a
// covered lens or a dark room would otherwise hold the spinner forever.
const CALIBRATION_TIMEOUT_MS = 15_000

// Attention has to be regained for this long before the warning clears —
// stops a single frame of noise from toggling the overlay on and off.
const RECOVERY_MS = 600

const GAZE_SHAPES = [
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
]

// MediaPipe hands back a column-major 4x4; element (row, col) is data[col*4+row].
// Only the rotation block matters here.
function headAngles(matrixData) {
  const r = (row, col) => matrixData[col * 4 + row]
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r(2, 0))))
  const pitch = Math.atan2(r(2, 1), r(2, 2))
  return { yaw, pitch }
}

function maxGazeScore(blendshapes) {
  if (!blendshapes?.categories) return 0
  let max = 0
  for (const category of blendshapes.categories) {
    if (GAZE_SHAPES.includes(category.categoryName) && category.score > max) max = category.score
  }
  return max
}

export function useAttentionMonitor() {
  // 'idle' | 'loading' | 'calibrating' | 'watching' | 'denied' | 'error'
  const status = ref('idle')
  const attentive = ref(true)
  const reason = ref(null)
  const errorMessage = ref('')
  const cameraStream = shallowRef(null)

  let landmarker = null
  let cameraEl = null
  let timer = null
  let handlers = {}
  let graceMs = 4000
  let shouldMonitor = null

  // Foreign-face state. `captureFrame` stays null unless the course asked for
  // captures, which is what keeps the canvas out of the picture entirely for
  // every other course.
  let captureFrame = false
  let lastForeignFaceAt = 0

  let baselineSamples = []
  let baseline = null
  let calibrationStartedAt = 0
  let awaySince = null
  let backSince = null
  let lostAt = null
  // Video position where the current inattentive stretch began, so the server
  // can cut exactly that range out of the watched segments.
  let lostAtPosition = null

  function emit(name, payload) {
    handlers[name]?.(payload)
  }

  async function loadLandmarker() {
    // Imported lazily: ~4MB of wasm glue that nobody who never opens a
    // monitored video should have to download.
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      // Two, not one: a second face is the whole point of the foreign-face
      // check, and with numFaces:1 the model simply never reports one.
      numFaces: 2,
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: true,
    })
  }

  function classify(result) {
    if (!result.faceLandmarks?.length) return { ok: false, why: ATTENTION_REASONS.NO_FACE }

    // More than one face is not an attention problem — the learner may well
    // be looking straight at the screen — so it is reported separately and
    // does not by itself pause the video.
    if (result.faceLandmarks.length > 1) {
      reportForeignFace(ATTENTION_REASONS.MULTIPLE_FACES, result.faceLandmarks.length)
    }

    const matrix = result.facialTransformationMatrixes?.[0]?.data
    if (!matrix) return { ok: true, why: null }

    const { yaw, pitch } = headAngles(matrix)

    // Still learning where this person's head normally sits.
    if (!baseline) {
      baselineSamples.push({ yaw, pitch })
      if (baselineSamples.length >= CALIBRATION_FRAMES) {
        const count = baselineSamples.length
        baseline = {
          yaw: baselineSamples.reduce((sum, s) => sum + s.yaw, 0) / count,
          pitch: baselineSamples.reduce((sum, s) => sum + s.pitch, 0) / count,
        }
        baselineSamples = []
        status.value = 'watching'
      }
      return { ok: true, why: null }
    }

    if (Math.abs(yaw - baseline.yaw) > YAW_LIMIT || Math.abs(pitch - baseline.pitch) > PITCH_LIMIT) {
      return { ok: false, why: ATTENTION_REASONS.LOOKING_AWAY }
    }
    // Head forward but eyes clearly elsewhere — a phone on the desk looks
    // exactly like this.
    if (maxGazeScore(result.faceBlendshapes?.[0]) > GAZE_LIMIT) {
      return { ok: false, why: ATTENTION_REASONS.LOOKING_AWAY }
    }
    return { ok: true, why: null }
  }

  /**
   * A face that should not be there. Rate-limited hard: the sample loop runs
   * several times a second and a second person tends to stay in frame, so
   * without the cooldown one visitor would produce a stream of identical
   * alerts and identical photographs.
   */
  function reportForeignFace(why, faceCount) {
    const now = performance.now()
    if (now - lastForeignFaceAt < FOREIGN_FACE_COOLDOWN_MS) return
    lastForeignFaceAt = now

    emit('foreignFace', {
      reason: why,
      faceCount,
      // Resolves to a Blob, or to null when the course did not ask for a
      // capture. The caller decides what to do with it; this module never
      // uploads anything itself.
      snapshot: captureFrame ? grabFrame() : Promise.resolve(null),
    })
  }

  // One JPEG of the current camera frame, at the capture resolution (320x240),
  // quality 0.7 — enough to recognise a person, small enough that the upload
  // never competes with the video for bandwidth.
  function grabFrame() {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = cameraEl.videoWidth || 320
        canvas.height = cameraEl.videoHeight || 240
        canvas.getContext('2d').drawImage(cameraEl, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7)
      } catch {
        // A capture that fails must not take the alert down with it — the
        // event is still worth reporting without a picture.
        resolve(null)
      }
    })
  }

  function sample(videoEl) {
    if (!landmarker || !cameraEl || cameraEl.readyState < 2) return

    // Nobody should be warned for looking away from a video they deliberately
    // paused — and once the baseline exists there is nothing left to learn
    // from a frame nobody is being judged on, so the inference is skipped
    // outright rather than run and discarded. That is the whole cost of this
    // feature: it used to keep the model running for as long as the page was
    // open, paused or not.
    //
    // The gate is deliberately not applied during calibration: classify() is
    // what feeds the baseline, and the calibration overlay covers the
    // controls, so the video cannot start until calibration finishes.
    if (baseline && shouldMonitor && !shouldMonitor()) {
      awaySince = null
      backSince = null
      return
    }

    let result
    try {
      result = landmarker.detectForVideo(cameraEl, performance.now())
    } catch {
      // A dropped frame is not worth tearing the session down over.
      return
    }

    // classify() also feeds the baseline, so it has to run before any gate
    // below. Calibrating only while the lesson plays would deadlock: the
    // calibration overlay covers the controls, so the video cannot start
    // until calibration finishes, and calibration cannot finish until the
    // video starts.
    const verdict = classify(result)
    const now = performance.now()

    if (!baseline) {
      // Someone off-camera, in the dark, or with the lens covered would
      // otherwise sit on the calibration spinner forever.
      if (now - calibrationStartedAt > CALIBRATION_TIMEOUT_MS) {
        status.value = 'error'
        errorMessage.value = 'No face detected — check your camera and lighting.'
        emit('error', { message: errorMessage.value, duringCalibration: true })
        // Releases the camera as well as the timer; stop() leaves the 'error'
        // status alone so the overlay can still explain what happened.
        stop()
      }
      return
    }

    if (!verdict.ok) {
      backSince = null
      if (awaySince === null) awaySince = now
      // Only after the full grace period does looking away become an event —
      // reaching for a cup must not trigger anything.
      if (attentive.value && now - awaySince >= graceMs) {
        attentive.value = false
        reason.value = verdict.why
        lostAt = now
        lostAtPosition = videoEl?.currentTime ?? null
        emit('lost', { reason: verdict.why, position: lostAtPosition })
      }
      return
    }

    awaySince = null
    if (attentive.value) return

    if (backSince === null) backSince = now
    if (now - backSince < RECOVERY_MS) return

    attentive.value = true
    reason.value = null
    emit('regained', {
      // Wall-clock seconds spent away, and the video range missed. They
      // differ whenever the policy paused playback, and both are worth having.
      seconds: (now - lostAt) / 1000,
      fromPosition: lostAtPosition,
      toPosition: videoEl?.currentTime ?? lostAtPosition,
    })
    backSince = null
    lostAt = null
    lostAtPosition = null
  }

  /**
   * Requests the camera and starts monitoring. Resolves to true when
   * monitoring is live, false when it could not start — the caller decides
   * what that means, since only the policy knows whether a refused camera
   * blocks playback or merely gets recorded.
   */
  async function start({ videoEl, graceSeconds = 4, isActive = null, captureOnForeignFace = false, on = {} }) {
    // Retrying after a failure comes back through here, so release whatever
    // the previous attempt left holding the camera before asking for it again.
    stop()

    handlers = on
    graceMs = graceSeconds * 1000
    shouldMonitor = isActive
    captureFrame = Boolean(captureOnForeignFace)
    lastForeignFaceAt = 0
    status.value = 'loading'
    errorMessage.value = ''

    // `navigator.mediaDevices` is simply absent outside a secure context, so
    // reaching the dev server over a LAN address instead of localhost would
    // otherwise fail as an opaque "cannot read property of undefined" rather
    // than something anyone can act on.
    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'error'
      errorMessage.value = window.isSecureContext
        ? 'This browser does not support camera capture.'
        : 'The camera is only available over HTTPS or on localhost.'
      emit('error', { message: errorMessage.value })
      return false
    }

    try {
      cameraStream.value = await navigator.mediaDevices.getUserMedia({
        // Low resolution on purpose: a face landmark model needs nothing
        // more, and it keeps both CPU and any perceived intrusiveness down.
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
    } catch (error) {
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
      status.value = denied ? 'denied' : 'error'
      errorMessage.value = error?.message ?? String(error)
      emit(denied ? 'denied' : 'error', { message: errorMessage.value })
      return false
    }

    try {
      cameraEl = document.createElement('video')
      cameraEl.autoplay = true
      cameraEl.playsInline = true
      cameraEl.muted = true
      cameraEl.srcObject = cameraStream.value
      await cameraEl.play()

      landmarker = await loadLandmarker()
    } catch (error) {
      status.value = 'error'
      errorMessage.value = error?.message ?? String(error)
      // The camera opened but the model did not; without this the failure is
      // invisible except for a camera light that stays on for no reason.
      console.error('[attention] face landmarker failed to load', error)
      emit('error', { message: errorMessage.value })
      stop()
      return false
    }

    baseline = null
    baselineSamples = []
    awaySince = null
    backSince = null
    attentive.value = true
    status.value = 'calibrating'
    calibrationStartedAt = performance.now()

    scheduleNext(videoEl)
    return true
  }

  // A self-rescheduling timeout rather than one fixed interval, so the cadence
  // can drop once calibration hands over to monitoring. It also means a slow
  // sample can never stack up behind the next tick the way setInterval allows.
  function scheduleNext(videoEl) {
    timer = setTimeout(() => {
      sample(videoEl)
      if (timer !== null) scheduleNext(videoEl)
    }, baseline ? SAMPLE_INTERVAL_MS : CALIBRATION_INTERVAL_MS)
  }

  function stop() {
    clearTimeout(timer)
    timer = null
    landmarker?.close?.()
    landmarker = null
    // Releasing the track is what turns the camera indicator light off — it
    // must happen on every teardown path, not just the tidy one.
    cameraStream.value?.getTracks().forEach((track) => track.stop())
    cameraStream.value = null
    if (cameraEl) {
      cameraEl.srcObject = null
      cameraEl = null
    }
    if (status.value !== 'denied' && status.value !== 'error') status.value = 'idle'
    attentive.value = true
    reason.value = null
  }

  return { status, attentive, reason, errorMessage, start, stop }
}
