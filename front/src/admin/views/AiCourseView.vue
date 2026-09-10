<script setup>
/**
 * Generating a course draft.
 *
 * The screen says three things the author needs to believe before they will
 * use it: the result is a **draft** they will review, the document they
 * upload is **not stored**, and personal identifiers in it are **redacted
 * before anything is sent**. All three are true (see the backend's
 * aiCourse.service.js and piiRedact.js) and none of them are guessable from
 * a "Generate" button.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { aiGenerationApi } from '@/services/aiGeneration'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import FileDropzone from '@/components/ui/FileDropzone.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const toast = useToast()

const topic = ref('')
const lang = ref('Uzbek')
const lessonCount = ref('')
const file = ref(null)
const starting = ref(false)

const jobs = ref([])
const usage = ref(null)

const canStart = computed(() => Boolean(file.value || topic.value.trim().length >= 3))
// A job the server is still working on. The list is polled while one
// exists and left alone when none does — an idle screen makes no requests.
const pending = computed(() => jobs.value.some((job) => ['PENDING', 'RUNNING'].includes(job.status)))

let poll = null

async function load() {
  try {
    const [list, month] = await Promise.all([aiGenerationApi.jobs(), aiGenerationApi.usage().catch(() => null)])
    jobs.value = list
    usage.value = month
  } catch (error) {
    toast.error(apiErrorText(error, t('ai.loadFailed')))
  }
}

function schedulePoll() {
  if (poll || !pending.value) return
  poll = window.setTimeout(async () => {
    poll = null
    await load()
    schedulePoll()
  }, 4000)
}

async function start() {
  if (!canStart.value || starting.value) return
  starting.value = true
  try {
    await aiGenerationApi.courseOutline({
      file: file.value,
      topic: topic.value.trim(),
      lessonCount: lessonCount.value ? Number(lessonCount.value) : undefined,
      lang: lang.value,
    })
    file.value = null
    topic.value = ''
    toast.success(t('ai.started'))
    await load()
    schedulePoll()
  } catch (error) {
    toast.error(apiErrorText(error, t('ai.startFailed')))
  } finally {
    starting.value = false
  }
}

const STATUS_VARIANT = { PENDING: 'neutral', RUNNING: 'warning', DONE: 'success', FAILED: 'danger' }

onMounted(async () => {
  await load()
  schedulePoll()
})
onBeforeUnmount(() => {
  if (poll) window.clearTimeout(poll)
})
</script>

<template>
  <div class="mx-auto max-w-[1440px] px-6 py-6">
    <div class="border-b border-border pb-4">
      <h1 class="text-h2 text-ink">{{ t('ai.title') }}</h1>
      <p class="mt-0.5 text-small text-ink-muted">{{ t('ai.subtitle') }}</p>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <AppCard>
        <p class="text-small font-semibold text-ink">{{ t('ai.sourceTitle') }}</p>

        <FileDropzone
          v-if="!file"
          accept=".pdf,.docx,.pptx"
          class="mt-3"
          :title="t('ai.dropHint')"
          :hint="t('ai.dropTypes')"
          @select="(selected) => (file = selected)"
        />
        <div v-else class="mt-3 flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2">
          <Icon name="file-text" size="15" class="text-ink-faint" />
          <span class="min-w-0 flex-1 truncate text-small text-ink">{{ file.name }}</span>
          <AppButton variant="ghost" size="sm" icon="close" @click="file = null" />
        </div>

        <p class="mt-3 text-caption text-ink-faint">{{ t('ai.orTopic') }}</p>
        <AppInput v-model="topic" class="mt-1" :placeholder="t('ai.topicPlaceholder')" />

        <div class="mt-3 flex flex-wrap gap-2">
          <AppSelect
            v-model="lang"
            class="w-40"
            :options="[
              { value: 'Uzbek', label: t('ai.langUz') },
              { value: 'Russian', label: t('ai.langRu') },
              { value: 'English', label: t('ai.langEn') },
            ]"
          />
          <AppInput v-model="lessonCount" type="number" min="1" max="40" class="w-40" :label="t('ai.lessonCount')" />
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <AppButton :disabled="!canStart" :loading="starting" icon="send" @click="start">
            {{ t('ai.start') }}
          </AppButton>
          <span class="text-caption text-ink-faint">{{ t('ai.draftNote') }}</span>
        </div>

        <!-- The two promises the feature makes about the author's document. -->
        <ul class="mt-3 space-y-1 text-caption text-ink-faint">
          <li class="flex items-start gap-1.5">
            <Icon name="shield" size="12" class="mt-0.5 shrink-0" />
            {{ t('ai.privacyRedaction') }}
          </li>
          <li class="flex items-start gap-1.5">
            <Icon name="trash" size="12" class="mt-0.5 shrink-0" />
            {{ t('ai.privacyNotStored') }}
          </li>
        </ul>
      </AppCard>

      <AppCard v-if="usage">
        <p class="text-small font-semibold text-ink">{{ t('ai.usageTitle') }}</p>
        <p class="mt-1 text-h3 text-ink">{{ usage.used.toLocaleString(locale) }}</p>
        <p class="text-caption text-ink-faint">
          {{ t('ai.usageTokens', { month: usage.month }) }}
          <template v-if="usage.budget">
            · {{ t('ai.usageOf', { budget: usage.budget.toLocaleString(locale) }) }}
          </template>
        </p>
        <p v-if="usage.remaining !== null" class="mt-2 text-caption" :class="usage.exceeded ? 'text-danger' : 'text-ink-muted'">
          {{ usage.exceeded ? t('ai.usageExceeded') : t('ai.usageRemaining', { remaining: usage.remaining.toLocaleString(locale) }) }}
        </p>
        <p v-else class="mt-2 text-caption text-ink-faint">{{ t('ai.usageNoBudget') }}</p>
        <p class="mt-2 text-caption text-ink-faint">{{ t('ai.usageJobs', { count: usage.jobs }) }}</p>
      </AppCard>
    </div>

    <p class="mt-6 text-small font-semibold text-ink">{{ t('ai.jobsTitle') }}</p>
    <p v-if="!jobs.length" class="mt-1 text-small text-ink-faint">{{ t('ai.jobsEmpty') }}</p>

    <ul v-else class="mt-2 divide-y divide-border">
      <li v-for="job in jobs" :key="job.id" class="flex flex-wrap items-center gap-2 py-2.5">
        <Badge :variant="STATUS_VARIANT[job.status] ?? 'neutral'" size="sm">{{ t(`ai.status.${job.status}`) }}</Badge>
        <span class="min-w-0 flex-1 truncate text-small text-ink">
          {{ job.result?.title || job.sourceName || t('ai.untitledJob') }}
          <span v-if="job.result" class="text-ink-faint">
            · {{ t('ai.jobResult', { topics: job.result.topics, lessons: job.result.lessons }) }}
          </span>
        </span>
        <span class="shrink-0 text-caption text-ink-faint">
          {{ new Date(job.createdAt).toLocaleString(locale) }}
          <template v-if="job.usage?.outputTokens">
            · {{ t('ai.jobTokens', { count: job.usage.inputTokens + job.usage.outputTokens }) }}
          </template>
        </span>
        <span v-if="job.error" class="w-full text-caption text-danger">{{ job.error }}</span>
        <AppButton
          v-if="job.result?.courseId"
          variant="ghost"
          size="sm"
          icon="arrow-right"
          @click="router.push(`/bos/courses/${job.result.courseId}`)"
        >
          {{ t('ai.openDraft') }}
        </AppButton>
      </li>
    </ul>
  </div>
</template>
