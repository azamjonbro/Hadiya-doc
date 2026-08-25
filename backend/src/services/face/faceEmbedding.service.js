import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '../../config/logger.js'
import { ApiError } from '../../utils/ApiError.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.resolve(__dirname, '../../../models/face-api')

// Bumped only if the model files staged by fetch-face-models.mjs change —
// stored alongside every enrollment so a future model swap can tell old
// embeddings apart from new ones instead of silently comparing incompatible
// vectors.
export const FACE_MODEL_VERSION = 'vladmandic-face-api:ssd_mobilenetv1+face_recognition_v1'

const MIN_DETECTION_CONFIDENCE = 0.75
// Reject a face that's too small in frame (far from camera / low quality) —
// a descriptor from a tiny face is unreliable to match against later.
const MIN_FACE_WIDTH_RATIO = 0.15

// @tensorflow/tfjs-node ships a prebuilt native binary only for a handful
// of platform/Node-ABI combinations (confirmed: available for Linux x64 —
// this backend's production target — but NOT for macOS, including Apple
// Silicon dev machines). Importing it eagerly at module load would crash
// the whole server on boot on an unsupported platform, for a feature that
// is off by default. Both @tensorflow/tfjs-node and @vladmandic/face-api
// are therefore dynamically imported here, inside the lazy singleton
// loader below, so the rest of the backend boots and runs normally
// everywhere; only actually calling detectAndDescribe (enroll/verify) can
// hit the native-module gap, with a clear error instead of a boot crash.
let faceapiModule = null

// Loaded once, at first use, and reused for the life of the process — a
// verification is at most once per user per day, so there is no request
// path where reloading per-call would ever make sense (spec's own
// "don't reload the model every request" instruction). A second concurrent
// caller during load awaits the same promise rather than triggering a
// second load; a failed load resets so the next call retries instead of
// being stuck on a permanently-rejected promise.
let modelsReadyPromise = null

function ensureModelsLoaded() {
  if (!modelsReadyPromise) {
    modelsReadyPromise = (async () => {
      // Must be imported before @vladmandic/face-api — it registers the
      // 'tensorflow' backend that face-api's Node build expects.
      await import('@tensorflow/tfjs-node')
      const faceapi = await import('@vladmandic/face-api')
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR)
      await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR)
      await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR)
      faceapiModule = faceapi
      logger.info('Face verification models loaded', { modelsDir: MODELS_DIR })
    })().catch((error) => {
      modelsReadyPromise = null
      logger.error('Face verification runtime failed to load', { error: error.message })
      throw ApiError.internal(
        'Face verification is unavailable on this server right now',
        'FACE_RUNTIME_UNAVAILABLE'
      )
    })
  }
  return modelsReadyPromise
}

/**
 * Server-side face detection + descriptor extraction. The final match
 * decision (see faceVerification.service.js) always runs here, never in the
 * browser — a client can only ever submit pixels, not a pre-computed
 * embedding, so there is nothing about the outcome a modified client could
 * forge.
 */
export const faceEmbeddingService = {
  async detectAndDescribe(buffer) {
    await ensureModelsLoaded()
    const faceapi = faceapiModule

    let decoded
    try {
      decoded = faceapi.tf.node.decodeImage(buffer, 3)
    } catch {
      return { ok: false, reason: 'FACE_NOT_DETECTED' }
    }

    const batched = faceapi.tf.expandDims(decoded, 0)
    try {
      const options = new faceapi.SsdMobilenetv1Options({
        minConfidence: MIN_DETECTION_CONFIDENCE,
        maxResults: 5,
      })
      const detections = await faceapi
        .detectAllFaces(batched, options)
        .withFaceLandmarks()
        .withFaceDescriptors()

      if (detections.length === 0) return { ok: false, reason: 'FACE_NOT_DETECTED' }
      if (detections.length > 1) return { ok: false, reason: 'MULTIPLE_FACES' }

      const [detection] = detections
      const imageWidth = decoded.shape[1]
      if (detection.detection.box.width / imageWidth < MIN_FACE_WIDTH_RATIO) {
        return { ok: false, reason: 'LOW_QUALITY' }
      }

      return { ok: true, descriptor: Array.from(detection.descriptor) }
    } finally {
      faceapi.tf.dispose([decoded, batched])
    }
  },

  // Cosine similarity rather than Euclidean distance — bounded to [-1, 1]
  // regardless of vector magnitude, so FACE_MATCH_THRESHOLD means the same
  // thing across every enrollment.
  similarity(a, b) {
    if (a.length !== b.length) throw ApiError.internal('Face descriptor length mismatch')
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
  },

  // Averaging descriptors from several enrollment frames is a known-good
  // technique — noticeably more robust than averaging raw pixels or just
  // keeping one frame, and cheap since descriptors are only 128 floats.
  averageDescriptors(descriptors) {
    const length = descriptors[0].length
    const sum = new Array(length).fill(0)
    for (const descriptor of descriptors) {
      for (let i = 0; i < length; i += 1) sum[i] += descriptor[i]
    }
    return sum.map((value) => value / descriptors.length)
  },
}
