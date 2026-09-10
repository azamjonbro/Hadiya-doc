<script setup>
/**
 * Taking a SCORM package.
 *
 * The page is mostly one iframe. What it does *not* do is talk to the
 * package: the runtime API has to be same-origin with the content, so it
 * lives in a launcher page the API serves and frames itself (see the
 * backend's scormPlayerPage.js). This view learns what is happening through
 * postMessage, and re-reads the authoritative answer from the API rather
 * than trusting the message — the message says "something changed", the API
 * says what.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scormApi } from '@/services/scorm'
import { API_ORIGIN } from '@/services/apiBase'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const pkg = ref(null)
const launch = ref(null)
const progress = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const fullscreen = ref(false)

const completed = computed(() => Boolean(progress.value?.completed))
const passed = computed(() => progress.value?.successStatus === 'passed')
const failed = computed(() => progress.value?.successStatus === 'failed')

async function refreshProgress() {
  try {
    progress.value = await scormApi.progress(route.params.id)
  } catch {
    // Keep whatever was on screen: the package is still running, and a
    // failed status read is not the learner's problem.
  }
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    pkg.value = await scormApi.getById(route.params.id)
    if (pkg.value.processingStatus !== 'READY') {
      // Not an error — the author uploaded it a moment ago. The learner is
      // told to come back rather than shown a broken frame.
      loading.value = false
      return
    }
    launch.value = await scormApi.launch(route.params.id)
    await refreshProgress()
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('scorm.loadFailed'))
  } finally {
    loading.value = false
  }
}

/**
 * Messages from the launcher page.
 *
 * The origin is checked against the API's own: any page may post to this
 * window, and a message that says "you finished" has to come from the frame
 * we opened rather than from a tab somebody else left open.
 */
function onMessage(event) {
  if (event.origin !== API_ORIGIN) return
  const data = event.data
  if (!data || data.source !== 'scorm-player') return
  if (data.packageId !== route.params.id) return
  if (['committed', 'status', 'finished'].includes(data.type)) refreshProgress()
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  load()
})
watch(() => route.params.id, load)
onBeforeUnmount(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div :class="fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-bg' : 'mx-auto max-w-6xl px-6 py-8'">
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 text-small text-ink-muted transition-default hover:text-ink"
        @click="pkg ? router.push(`/courses/${pkg.courseId}`) : router.back()"
      >
        <Icon name="chevron-left" size="16" />
        {{ t('common.goBack') }}
      </button>
      <div class="ml-auto flex items-center gap-2">
        <Badge v-if="completed && passed" variant="success" size="sm">{{ t('scorm.passed') }}</Badge>
        <Badge v-else-if="completed" variant="success" size="sm">{{ t('scorm.completed') }}</Badge>
        <Badge v-else-if="failed" variant="danger" size="sm">{{ t('scorm.failed') }}</Badge>
        <span v-if="progress?.scoreRaw !== null && progress?.scoreRaw !== undefined" class="text-caption text-ink-faint">
          {{ t('scorm.score', { score: progress.scoreRaw }) }}
        </span>
        <AppButton variant="ghost" size="sm" :icon="fullscreen ? 'minimize' : 'maximize'" @click="fullscreen = !fullscreen">
          {{ fullscreen ? t('scorm.exitFullscreen') : t('scorm.fullscreen') }}
        </AppButton>
      </div>
    </div>

    <h1 v-if="pkg && !fullscreen" class="mt-3 text-h2 text-ink">{{ pkg.title }}</h1>
    <p v-if="pkg?.description && !fullscreen" class="mt-1 text-small text-ink-muted">{{ pkg.description }}</p>

    <div v-if="loading" class="mt-4">
      <Skeleton class="h-[70vh] w-full rounded-xl" />
    </div>

    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <!-- Uploaded but not unpacked yet. Its own state, not an error: the
         author's upload is fine, the worker simply has not finished. -->
    <div
      v-else-if="pkg && pkg.processingStatus !== 'READY'"
      class="mt-4 flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-2 px-6 py-16 text-center"
    >
      <Icon :name="pkg.processingStatus === 'FAILED' ? 'alert-triangle' : 'loader'" size="20" :class="pkg.processingStatus === 'FAILED' ? 'text-danger' : 'animate-spin text-ink-faint'" />
      <p class="text-small text-ink">
        {{ pkg.processingStatus === 'FAILED' ? t('scorm.failedToPrepare') : t('scorm.preparing') }}
      </p>
      <AppButton variant="ghost" size="sm" icon="refresh" @click="load">{{ t('common.retry') }}</AppButton>
    </div>

    <div
      v-else-if="launch"
      class="mt-4 overflow-hidden rounded-xl border border-border bg-surface"
      :class="fullscreen ? 'flex-1' : ''"
    >
      <!-- The launcher page. Not sandboxed here: it must stay same-origin
           with the package it nests, which is the whole reason it exists.
           Its own headers narrow what it may do (scormFrame.middleware.js). -->
      <iframe
        :src="launch.playerUrl"
        :title="pkg.title"
        class="w-full"
        :class="fullscreen ? 'h-full' : 'h-[75vh]'"
        allow="autoplay; fullscreen; microphone"
        allowfullscreen
      />
    </div>

    <p v-if="!fullscreen && launch" class="mt-2 text-caption text-ink-faint">{{ t('scorm.autoSaved') }}</p>
  </div>
</template>
