import { computed, ref } from 'vue'
import * as offline from '@/offline/offlineContent'
import { formatBytes } from '@/offline/offlinePlan'

/**
 * The course page's offline button (12.2).
 *
 * Three states and nothing else: not saved, saving (with what it is on),
 * saved (with its size and a delete). The plan is fetched before the
 * download starts so the button can say what it will cost.
 */
export function useOfflineCourse(courseId) {
  const supported = offline.isSupported()
  const record = ref(null)
  const plan = ref(null)
  const busy = ref(false)
  const progress = ref({ done: 0, total: 0, title: '' })
  const error = ref('')

  const saved = computed(() => Boolean(record.value))
  const sizeText = computed(() => (record.value ? formatBytes(record.value.bytes) : ''))

  async function refresh() {
    if (!supported) return
    record.value = await offline.savedCourse(courseId)
  }

  async function preview() {
    error.value = ''
    plan.value = await offline.planFor(courseId)
    return plan.value
  }

  async function save() {
    if (busy.value) return
    busy.value = true
    error.value = ''
    progress.value = { done: 0, total: 0, title: '' }
    try {
      record.value = await offline.saveCourse(courseId, {
        onProgress: (state) => {
          progress.value = state
        },
      })
      plan.value = null
    } catch (failure) {
      // The two refusals worth naming: no room, and a course too large to
      // hand somebody in one press.
      error.value = failure?.code ?? 'SAVE_FAILED'
      throw failure
    } finally {
      busy.value = false
    }
  }

  async function remove() {
    busy.value = true
    try {
      await offline.removeCourse(courseId)
      record.value = null
    } finally {
      busy.value = false
    }
  }

  return { supported, record, plan, saved, sizeText, busy, progress, error, refresh, preview, save, remove }
}
