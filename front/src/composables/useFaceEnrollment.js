import { ref } from 'vue'
import { useFaceCamera } from './useFaceCamera.js'

export const MAX_ENROLLMENT_FRAMES = 3

/**
 * Camera + manual multi-frame capture for SUPERADMIN-driven face enrollment.
 * No liveness/quality gating on this side — enrollment's job is just
 * producing up to MAX_ENROLLMENT_FRAMES clear reference photos; the backend
 * rejects the whole enrollment if any frame doesn't contain exactly one
 * detectable face once it's actually submitted.
 */
export function useFaceEnrollment() {
  const camera = useFaceCamera()
  const frames = ref([]) // [{ blob, url }]
  const cameraActive = ref(false)

  async function start() {
    await camera.start({ video: { width: 480, height: 360, facingMode: 'user' }, audio: false })
    cameraActive.value = true
  }

  async function captureFrame() {
    if (frames.value.length >= MAX_ENROLLMENT_FRAMES) return
    const blob = await camera.grabFrame(0.9)
    if (!blob) return
    frames.value.push({ blob, url: URL.createObjectURL(blob) })
  }

  function retake(index) {
    const [removed] = frames.value.splice(index, 1)
    if (removed) URL.revokeObjectURL(removed.url)
  }

  function reset() {
    for (const frame of frames.value) URL.revokeObjectURL(frame.url)
    frames.value = []
  }

  function stop() {
    reset()
    camera.stop()
    cameraActive.value = false
  }

  return { frames, cameraActive, cameraStream: camera.cameraStream, start, captureFrame, retake, stop }
}
