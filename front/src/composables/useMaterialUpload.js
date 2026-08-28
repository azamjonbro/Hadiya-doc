import { ref } from 'vue'
import { materialsApi } from '@/services/materials'
import { apiErrorText } from '@/utils/apiError'

// Plain single-shot multipart POST with progress tracking — unlike
// useVideoUpload.js's tus-based resumable-chunk state machine, materials
// are capped at MATERIAL_MAX_FILE_SIZE_MB (well under video sizes), so
// pause/resume/retry infrastructure isn't needed here.
export function useMaterialUpload() {
  const status = ref('idle') // idle | uploading | success | error
  const progress = ref(0)
  const errorMessage = ref('')

  async function start(topicId, { type, title, description, order, file }) {
    status.value = 'uploading'
    progress.value = 0
    errorMessage.value = ''
    try {
      const material = await materialsApi.create(topicId, { type, title, description, order, file }, (event) => {
        if (event.total) progress.value = Math.round((event.loaded / event.total) * 100)
      })
      status.value = 'success'
      return material
    } catch (error) {
      status.value = 'error'
      errorMessage.value = apiErrorText(error)
      return null
    }
  }

  function reset() {
    status.value = 'idle'
    progress.value = 0
    errorMessage.value = ''
  }

  return { status, progress, errorMessage, start, reset }
}
