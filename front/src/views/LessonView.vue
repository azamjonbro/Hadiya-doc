<script setup>
/**
 * Reading one text lesson.
 *
 * Progress is measured in blocks that have actually been on screen, not in
 * scroll position: a reader who drags the scrollbar to the bottom has seen
 * the bottom, and a percentage built on "how far down the page" would hand
 * out completion for a flick of the wrist. An IntersectionObserver reports
 * each block once it has been visible, the ids are batched, and the server
 * decides what that adds up to (backend `lessonProgress.service.js`).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { lessonsApi } from '@/services/lessons'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import LessonBlock from '@/components/lesson/LessonBlock.vue'
import { offlineLesson } from '@/offline/offlineContent'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const lesson = ref(null)
const progress = ref(null)
const loading = ref(true)
const errorMessage = ref('')
// Set when the lesson came out of the offline store rather than the API:
// the reader is told, because their progress will not be recorded until
// they are back online (12.3 queues it).
const fromOffline = ref(false)
const finishing = ref(false)

const blockRefs = new Map()
let observer = null

// Blocks seen but not yet reported. A set, because the observer fires again
// for a block scrolled back into view and the same id twice is not progress.
const pending = new Set()
let flushTimer = null

// Blocks this reader has had on screen in this sitting, plus the ones the
// server already knew about.
const seenIds = ref(new Set())
const completed = computed(() => Boolean(progress.value?.completed))
const lastBlockId = computed(() => lesson.value?.blocks?.at(-1)?.id ?? null)
// The finish button only means anything once the reader has reached the end,
// and the server enforces the same rule — the client asking nicely is not
// the control.
const canFinish = computed(() => Boolean(lastBlockId.value) && seenIds.value.has(lastBlockId.value))

async function flush() {
  flushTimer = null
  if (!pending.size || !lesson.value) return
  const batch = [...pending]
  pending.clear()
  try {
    progress.value = await lessonsApi.recordBlocks(lesson.value.id, batch)
  } catch {
    // Reading is not a transaction. A failed report is retried by putting the
    // ids back — the next block to scroll into view carries them along.
    batch.forEach((id) => pending.add(id))
  }
}

/**
 * One report per pause rather than one per block.
 *
 * Scrolling through a page passes four blocks in a second, and four requests
 * for one flick would make a reading page feel like a game. A second and a
 * half is long enough to coalesce a scroll and short enough that leaving the
 * page does not lose it.
 */
function scheduleFlush() {
  if (flushTimer) return
  flushTimer = window.setTimeout(flush, 1500)
}

function markSeen(id) {
  if (seenIds.value.has(id)) return
  seenIds.value = new Set([...seenIds.value, id])
  pending.add(id)
  scheduleFlush()
}

function observe() {
  observer?.disconnect()
  if (!window.IntersectionObserver) {
    // No observer (an old browser, or a test environment): every block counts
    // as read on load. The alternative is a reader who can never finish.
    lesson.value?.blocks?.forEach((block) => markSeen(block.id))
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const id = entry.target.dataset.blockId
        if (id) markSeen(id)
        observer.unobserve(entry.target)
      })
    },
    // Half of the block, or 200px of a long one, has to be on screen.
    { threshold: [0.5], rootMargin: '0px 0px -10% 0px' }
  )
  blockRefs.forEach((element) => element && observer.observe(element))
}

function keepRef(id, element) {
  if (element) blockRefs.set(id, element)
  else blockRefs.delete(id)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [loaded, current] = await Promise.all([
      lessonsApi.getById(route.params.id),
      lessonsApi.progress(route.params.id),
    ])
    lesson.value = loaded
    progress.value = current
    // Blocks already read in an earlier sitting are not reported again.
    seenIds.value = new Set(current.completed ? loaded.blocks.map((block) => block.id) : [])
  } catch (error) {
    /**
     * The request failed — which offline is the normal case, not an
     * exception (12.2). If this lesson was saved deliberately, read it
     * from there and say so; otherwise report the failure as before.
     *
     * Progress is not read offline: the number would be whatever was true
     * when the course was saved, and showing a stale percentage as current
     * is worse than showing none.
     */
    const stored = await offlineLesson(route.params.id)
    if (stored) {
      lesson.value = stored
      progress.value = null
      fromOffline.value = true
      seenIds.value = new Set()
    } else {
      errorMessage.value = apiErrorText(error, t('lesson.loadFailed'))
    }
  } finally {
    loading.value = false
  }
}

async function finish() {
  finishing.value = true
  try {
    // Anything still queued has to land first, or the server refuses: it
    // checks the last block was actually seen.
    if (flushTimer) window.clearTimeout(flushTimer)
    await flush()
    progress.value = await lessonsApi.markComplete(lesson.value.id)
    toast.success(t('lesson.finished'))
  } catch (error) {
    toast.error(apiErrorText(error, t('lesson.finishFailed')))
  } finally {
    finishing.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)
// The DOM is rebuilt when a lesson loads, so the observer is attached to the
// new nodes rather than the ones that have gone.
watch(
  () => lesson.value?.id,
  () => window.setTimeout(observe, 0)
)

onBeforeUnmount(() => {
  observer?.disconnect()
  if (flushTimer) window.clearTimeout(flushTimer)
  // Leaving the page is exactly when the last blocks read would be lost.
  flush()
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <button
      type="button"
      class="flex items-center gap-1.5 text-small text-ink-muted transition-default hover:text-ink"
      @click="lesson ? router.push(`/courses/${lesson.courseId}`) : router.back()"
    >
      <Icon name="chevron-left" size="16" />
      {{ t('common.goBack') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-9 w-72" />
      <Skeleton class="h-24 w-full rounded-xl" />
      <Skeleton class="h-24 w-full rounded-xl" />
    </div>

    <p v-else-if="errorMessage" class="mt-6 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="lesson">
      <header class="mt-4 border-b border-border pb-4">
        <div class="flex items-start justify-between gap-3">
          <h1 class="text-h1 text-ink">{{ lesson.title }}</h1>
          <Badge v-if="completed" variant="success" size="sm">{{ t('lesson.completed') }}</Badge>
        </div>
        <p v-if="lesson.description" class="mt-1.5 text-small text-ink-muted">{{ lesson.description }}</p>
        <!-- 12.2 — read from the saved copy. Said plainly, because
             progress is not being recorded from here. -->
        <p v-if="fromOffline" class="mt-2 flex items-center gap-1.5 text-caption text-warning">
          <Icon name="alert-triangle" size="13" />
          {{ t('offline.readingSaved') }}
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-caption text-ink-faint">
          <span>{{ t('content.blockCount', { count: lesson.blockCount }) }}</span>
          <span v-if="lesson.estimatedMinutes">· {{ t('courses.minutes', { count: lesson.estimatedMinutes }) }}</span>
        </div>
        <div v-if="progress" class="mt-3 flex items-center gap-2.5">
          <ProgressBar :value="progress.completionPercent" class="flex-1" />
          <span class="shrink-0 text-caption text-ink-faint">
            {{ progress.viewedBlocks }}/{{ progress.totalBlocks }}
          </span>
        </div>
      </header>

      <article class="mt-6 space-y-5">
        <div
          v-for="block in lesson.blocks"
          :key="block.id"
          :ref="(element) => keepRef(block.id, element)"
          :data-block-id="block.id"
        >
          <LessonBlock :block="block" :course-id="lesson.courseId" />
        </div>
      </article>

      <div class="mt-8 border-t border-border pt-4">
        <AppButton v-if="!completed" :disabled="!canFinish" :loading="finishing" icon="check" @click="finish">
          {{ t('lesson.finish') }}
        </AppButton>
        <p v-if="!completed && !canFinish" class="mt-2 text-caption text-ink-faint">{{ t('lesson.readToEnd') }}</p>
        <p v-if="completed" class="flex items-center gap-1.5 text-small text-success">
          <Icon name="check-circle" size="15" />
          {{ t('lesson.completedNote') }}
        </p>
      </div>
    </template>
  </div>
</template>
