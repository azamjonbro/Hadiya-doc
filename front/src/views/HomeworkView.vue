<script setup>
/**
 * Handing in one piece of homework.
 *
 * A draft is saved separately from handing in, because half an essay
 * written on Tuesday should survive until Thursday — and because a draft
 * that counted as an attempt would punish somebody for saving their work.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { homeworkApi } from '@/services/homework'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const state = ref(null)
const loading = ref(true)
const saving = ref(false)
const text = ref('')
const linkInput = ref('')
const links = ref([])

const assignment = computed(() => state.value?.assignment ?? null)
const draft = computed(() => state.value?.attempts.find((row) => row.status === 'DRAFT') ?? null)
const handedIn = computed(() => (state.value?.attempts ?? []).filter((row) => row.status !== 'DRAFT').reverse())

const statusVariant = { SUBMITTED: 'info', GRADED: 'success', RETURNED: 'warning', DRAFT: 'neutral' }

async function load() {
  loading.value = true
  try {
    state.value = await homeworkApi.mine(route.params.id)
    text.value = draft.value?.text ?? ''
    links.value = draft.value?.links ?? []
  } catch (error) {
    toast.error(apiErrorText(error, t('homework.loadError')))
  } finally {
    loading.value = false
  }
}

function addLink() {
  const value = linkInput.value.trim()
  if (!value || links.value.includes(value)) {
    linkInput.value = ''
    return
  }
  links.value.push(value)
  linkInput.value = ''
}

async function saveDraft() {
  saving.value = true
  try {
    await homeworkApi.saveDraft(route.params.id, { text: text.value, links: links.value })
    toast.success(t('homework.draftSaved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('homework.saveError')))
  } finally {
    saving.value = false
  }
}

async function submit() {
  const ok = await confirm({
    title: t('homework.submitTitle'),
    message: state.value.late ? t('homework.submitLateMessage') : t('homework.submitMessage'),
    danger: false,
  })
  if (!ok) return
  saving.value = true
  try {
    await homeworkApi.submit(route.params.id, { text: text.value, links: links.value })
    toast.success(t('homework.submitted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('homework.saveError')))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small text-ink-muted hover:text-ink" @click="router.back()">
      <Icon name="chevron-left" size="16" />
      {{ t('common.goBack') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton class="h-32 w-full rounded-xl" />
    </div>

    <template v-else-if="assignment">
      <h1 class="mt-4 text-h1 text-ink">{{ assignment.title }}</h1>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-caption text-ink-faint">
        <span v-if="assignment.dueAt">
          {{ t('homework.due', { date: new Date(assignment.dueAt).toLocaleDateString(locale) }) }}
        </span>
        <Badge v-if="state.late && !state.closed" variant="warning" size="sm">{{ t('homework.lateNow') }}</Badge>
        <Badge v-if="state.closed" variant="danger" size="sm">{{ t('homework.closed') }}</Badge>
        <span v-if="assignment.maxAttempts">
          · {{ t('homework.attemptsLeft', { used: handedIn.length, total: assignment.maxAttempts }) }}
        </span>
      </div>

      <p v-if="assignment.instructions" class="mt-4 whitespace-pre-wrap text-small text-ink-muted">
        {{ assignment.instructions }}
      </p>

      <!-- Previous attempts, newest first: the mark and the comments are
           the reason somebody opens this page again. -->
      <div v-if="handedIn.length" class="mt-6 space-y-2">
        <h2 class="text-small font-medium text-ink">{{ t('homework.yourAttempts') }}</h2>
        <AppCard v-for="attempt in handedIn" :key="attempt.id" class="p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <Badge :variant="statusVariant[attempt.status]" size="sm">{{ t(`homework.status.${attempt.status}`) }}</Badge>
              <span class="text-caption text-ink-faint">
                {{ t('homework.attemptNo', { number: attempt.attemptNo }) }} ·
                {{ new Date(attempt.submittedAt).toLocaleDateString(locale) }}
              </span>
            </div>
            <span v-if="attempt.score !== null" class="text-small font-semibold text-ink">
              {{ attempt.score }} / {{ assignment.maxScore }}
            </span>
          </div>
          <p v-if="attempt.feedback" class="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-small text-ink">
            {{ attempt.feedback }}
          </p>
        </AppCard>
      </div>

      <AppCard v-if="state.canSubmit" class="mt-6 space-y-4 p-5">
        <div v-if="assignment.submissionTypes.includes('TEXT')">
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('homework.yourAnswer') }}</label>
          <textarea
            v-model="text"
            rows="6"
            class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div v-if="assignment.submissionTypes.includes('LINK')">
          <label class="mb-1.5 block text-small font-medium text-ink">{{ t('homework.links') }}</label>
          <div v-if="links.length" class="mb-2 space-y-1">
            <p v-for="(link, index) in links" :key="link" class="flex items-center gap-2 text-small text-ink-muted">
              <Icon name="link" size="14" />
              <span class="truncate">{{ link }}</span>
              <button type="button" class="text-ink-faint hover:text-danger" @click="links.splice(index, 1)">
                <Icon name="close" size="12" />
              </button>
            </p>
          </div>
          <div class="flex gap-2">
            <AppInput v-model="linkInput" class="flex-1" placeholder="https://" @keyup.enter="addLink" />
            <AppButton variant="secondary" @click="addLink">{{ t('homework.addLink') }}</AppButton>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <!-- Saving and handing in are separate on purpose: half an essay
               written on Tuesday should survive until Thursday. -->
          <AppButton variant="secondary" :loading="saving" @click="saveDraft">{{ t('homework.saveDraft') }}</AppButton>
          <AppButton :loading="saving" @click="submit">{{ t('homework.submit') }}</AppButton>
        </div>
      </AppCard>

      <p v-else class="mt-6 text-small text-ink-muted">
        {{ state.closed ? t('homework.closedHint') : t('homework.noAttemptsLeft') }}
      </p>
    </template>
  </div>
</template>
