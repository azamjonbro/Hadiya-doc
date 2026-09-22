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
// A blink keeps the eyes shut for roughly 100–150 ms. Sampling every 120 ms
// straddled that and missed most of them, and a missed blink meant sitting
// out the whole timeout — the "face control is slow" of 2026-09-14.
const LIVENESS_SAMPLE_MS = 40
// The whole check has to fit in two to three seconds (asked for on
// 2026-09-21: 5 s of waiting for a blink was most of the wait), and this
// wait is the only elastic part — camera, upload and the server match are
// each a few hundred ms. A blink seen inside the window still ends it
// early; one that is not seen was never the security boundary (see
// below), so the frame goes to the server regardless.
const LIVENESS_TIMEOUT_MS = 1500

// One landmarker for the life of the page. The gate fires many times in a
// session (every video, every quiz), and building one costs the wasm
// runtime plus a 3.7 MB model each time — far more than the check itself.
// Kept as a promise so a second caller mid-load waits on the first; a
// failed load is dropped so the next call retries rather than staying
// rejected forever.
let landmarkerPromise = null

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
    })().catch((error) => {
      landmarkerPromise = null
      throw error
    })
  }
  return landmarkerPromise
}

/** Warm the landmarker before it is needed — e.g. when the gate screen opens. */
export function preloadFaceLandmarker() {
  loadLandmarker().catch(() => {})
}

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

    // The camera prompt and the model load are independent waits — run
    // them together rather than one after the other.
    const [videoEl, loaded] = await Promise.all([
      camera.start({ video: { width: 480, height: 360, facingMode: 'user' }, audio: false }),
      loadLandmarker(),
    ])

    status.value = 'detecting'
    landmarker = loaded
    await waitForBlink(videoEl)

    const blob = await camera.grabFrame(0.9)
    status.value = 'ready'
    return blob
  }

  function stop() {
    clearTimeout(timer)
    timer = null
    // The landmarker outlives the capture (see loadLandmarker); only the
    // camera is released here.
    landmarker = null
    camera.stop()
    status.value = 'idle'
  }

  return { status, cameraStream: camera.cameraStream, capture, stop }
}
