import { shallowRef } from 'vue'

/**
 * Camera acquisition + off-DOM video element + JPEG frame capture — the part
 * of camera-based face features that has nothing to do with what a caller
 * does with the frames. Shared by useAttentionMonitor.js (gaze/foreign-face
 * detection during video playback) and the face-enrollment/verification
 * composables (identity matching) so there is one place that opens a
 * getUserMedia stream and turns off the camera light on teardown, not
 * several independently-written ones.
 *
 * Deliberately dumb: no getUserMedia-support check, no error classification.
 * Each caller already has its own status/error state machine (denied vs.
 * unsupported vs. other), so this only does the acquire/teardown/capture
 * mechanics and lets errors propagate raw.
 */
export function useFaceCamera() {
  const cameraStream = shallowRef(null)
  let cameraEl = null

  async function start(constraints) {
    cameraStream.value = await navigator.mediaDevices.getUserMedia(constraints)

    cameraEl = document.createElement('video')
    cameraEl.autoplay = true
    cameraEl.playsInline = true
    cameraEl.muted = true
    cameraEl.srcObject = cameraStream.value
    await cameraEl.play()

    return cameraEl
  }

  function getElement() {
    return cameraEl
  }

  // One JPEG of the current camera frame, sized to whatever the element
  // actually is (set by the constraints passed to start()).
  function grabFrame(quality = 0.85) {
    return new Promise((resolve) => {
      if (!cameraEl) {
        resolve(null)
        return
      }
      try {
        const canvas = document.createElement('canvas')
        canvas.width = cameraEl.videoWidth || 320
        canvas.height = cameraEl.videoHeight || 240
        canvas.getContext('2d').drawImage(cameraEl, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
      } catch {
        // A capture that fails must not take the caller down with it.
        resolve(null)
      }
    })
  }

  function stop() {
    // Releasing the track is what turns the camera indicator light off — it
    // must happen on every teardown path, not just the tidy one.
    cameraStream.value?.getTracks().forEach((track) => track.stop())
    cameraStream.value = null
    if (cameraEl) {
      cameraEl.srcObject = null
      cameraEl = null
    }
  }

  return { cameraStream, start, stop, grabFrame, getElement }
}
