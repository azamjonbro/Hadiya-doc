import { ref } from 'vue'
import { useFaceCamera } from './useFaceCamera.js'

// Mirrors useAttentionMonitor.js's asset paths — see scripts/fetch-mediapipe-assets.mjs.
// Deliberately not shared as an import between the two files: this is the
// only thing the two composables would have in common, and duplicating two
// path strings is cheaper than coupling two otherwise-independent modules
// over it.
const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/face_landmarker.task'

const BLINK_SHAPES = ['eyeBlinkLeft', 'eyeBlinkRight']
const BLINK_CLOSED_SCORE = 0.5
const BLINK_OPEN_SCORE = 0.2
const LIVENESS_SAMPLE_MS = 120
// A natural blink happens every few seconds for almost everyone — this is
// generous without making a legitimate employee wait long for a missed one.
const LIVENESS_TIMEOUT_MS = 8000

function maxBlinkScore(blendshapes) {
  if (!blendshapes?.categories) return 0
  let max = 0
  for (const category of blendshapes.categories) {
    if (BLINK_SHAPES.includes(category.categoryName) && category.score > max) max = category.score
  }
  return max
}

/**
 * Camera → passive liveness (wait briefly for a natural blink) → one JPEG
 * frame, ready for POST /auth/face/verify.
 *
 * Liveness here is a deterrent against a static printed photo, not a
 * cryptographic guarantee (see docs/face-verification.md) — it simply
 * proceeds with whatever frame is available after a short timeout rather
 * than blocking a legitimate employee indefinitely on a missed detection.
 * The actual security boundary is the server-side face match, always run
 * against the submitted pixels, never trusted from anything computed here.
 */
export function useFaceVerification() {
  const camera = useFaceCamera()
  // 'idle' | 'requestingCamera' | 'detecting' | 'ready'
  const status = ref('idle')

  let landmarker = null
  let timer = null

  async function loadLandmarker() {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    })
  }

  // Resolves once a blink is seen or the timeout elapses — never rejects on
  // "no blink", since that is inconclusive, not a failure.
  function waitForBlink(videoEl) {
    return new Promise((resolve) => {
      const startedAt = performance.now()
      let sawClosed = false

      function sample() {
        if (performance.now() - startedAt > LIVENESS_TIMEOUT_MS) {
          resolve(false)
          return
        }
        try {
          const result = landmarker.detectForVideo(videoEl, performance.now())
          const score = maxBlinkScore(result.faceBlendshapes?.[0])
          if (score > BLINK_CLOSED_SCORE) sawClosed = true
          else if (sawClosed && score < BLINK_OPEN_SCORE) {
            resolve(true)
            return
          }
        } catch {
          // A dropped frame is not worth aborting liveness over.
        }
        timer = setTimeout(sample, LIVENESS_SAMPLE_MS)
      }
      sample()
    })
  }

  /**
   * Opens the camera, waits briefly for a blink, and returns one JPEG Blob.
   * Throws only if the camera itself cannot be opened (permission denied,
   * unsupported browser) — the caller classifies that error the same way
   * useAttentionMonitor.js's callers already do (error?.name check).
   */
  async function capture() {
    status.value = 'requestingCamera'

    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'idle'
      throw new Error(
        window.isSecureContext
          ? 'This browser does not support camera capture.'
          : 'The camera is only available over HTTPS or on localhost.'
      )
    }

    const videoEl = await camera.start({ video: { width: 480, height: 360, facingMode: 'user' }, audio: false })

    status.value = 'detecting'
    landmarker = await loadLandmarker()
    await waitForBlink(videoEl)

    const blob = await camera.grabFrame(0.9)
    status.value = 'ready'
    return blob
  }

  function stop() {
    clearTimeout(timer)
    timer = null
    landmarker?.close?.()
    landmarker = null
    camera.stop()
    status.value = 'idle'
  }

  return { status, cameraStream: camera.cameraStream, capture, stop }
}
