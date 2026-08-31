import { computed, ref } from 'vue'
import { FACE_GATE_ACTIONS } from '@lms/shared'
import { useFaceVerification } from './useFaceVerification.js'
import { faceApi } from '@/services/face'

/**
 * The face check that stands in front of course content — a video, a
 * material, a test.
 *
 * Nothing here decides whether the check is needed: the API does, by refusing
 * the request that would have handed the content over (403
 * FACE_VERIFICATION_REQUIRED / FACE_ENROLLMENT_REQUIRED, see
 * backend/src/services/face/faceGate.service.js). The caller hands its own
 * failure to `claim()`; if that is what went wrong, this takes over the
 * screen, runs the capture, and re-runs the caller's action once it passes.
 *
 * Extracted from VideoPlayer.vue, which is where it started as the daily
 * playback gate — three call sites now, and the state machine they share is
 * the same one.
 *
 * @param {() => (void | Promise<void>)} onPass — the action to retry once the
 *   check passes. Usually the exact call that just 403'd.
 */
export function useFaceGate(onPass) {
  const verification = useFaceVerification()

  // 'none'  — nothing in the way, the caller's content is showing
  // 'enroll' — no reference photo on file; the wizard is up
  // the rest are FaceVerificationPanel's own states
  const state = ref('none')
  const errorMessage = ref('')
  // Which of FACE_GATE_ACTIONS is being gated, so the copy can name it.
  const action = ref(FACE_GATE_ACTIONS.VIDEO)
  const showEnrollment = ref(false)

  const active = computed(() => state.value !== 'none')

  /**
   * Takes over if `error` is a face-gate refusal. Returns true when it did,
   * so the caller can `if (gate.claim(error)) return` and leave its own error
   * handling alone otherwise.
   */
  function claim(error) {
    const body = error?.response?.data
    if (body?.code !== 'FACE_VERIFICATION_REQUIRED' && body?.code !== 'FACE_ENROLLMENT_REQUIRED') return false

    action.value = body.details?.action ?? action.value
    errorMessage.value = ''

    if (body.code === 'FACE_ENROLLMENT_REQUIRED') {
      // First use, no reference photo on file: the employee captures their
      // own, the way a banking app has you do it, rather than waiting for an
      // admin. The gate stays `active` behind the wizard so nothing opens
      // underneath it.
      state.value = 'enroll'
      showEnrollment.value = true
    } else {
      state.value = 'idle'
    }
    return true
  }

  async function pass() {
    showEnrollment.value = false
    state.value = 'none'
    await onPass?.()
  }

  async function capture() {
    state.value = 'requestingCamera'
    errorMessage.value = ''
    try {
      const photoBlob = await verification.capture()
      state.value = 'verifying'
      await faceApi.verify(photoBlob)
      state.value = 'success'
      // Long enough to read "verified", short enough not to feel like a wait.
      setTimeout(pass, 600)
    } catch (error) {
      if (error?.response) {
        state.value = error.response.status === 429 ? 'locked' : 'failed'
        return
      }
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
      state.value = denied ? 'denied' : 'error'
      errorMessage.value = error?.message ?? String(error)
    } finally {
      // Releases the track and turns the camera light off — on the success
      // path too, or the preview keeps streaming for as long as the page is
      // open. stop() is idempotent, so the error paths are unaffected.
      verification.stop()
    }
  }

  // Enrolling counts as the check that was being asked for, so the content
  // opens straight away rather than asking for a second photo.
  function onEnrolled() {
    return pass()
  }

  function reset() {
    verification.stop()
    state.value = 'none'
    showEnrollment.value = false
    errorMessage.value = ''
  }

  return {
    state,
    errorMessage,
    action,
    showEnrollment,
    active,
    cameraStream: verification.cameraStream,
    claim,
    capture,
    onEnrolled,
    reset,
    stop: verification.stop,
  }
}
