<script setup>
/**
 * One questionnaire, answered once.
 *
 * Three things this screen owes the person filling it in:
 *
 *  - the required questions are checked here, before the request. The server
 *    refuses the whole submission on the first unanswered one, and finding
 *    that out through a round trip means scrolling back up to look for which
 *    question it meant.
 *  - what is anonymous says so, in the group's own terms. "Anonymous" with
 *    no threshold attached is a promise nobody can check; the sentence names
 *    the number the report actually enforces.
 *  - a failed submit never touches the answers. Everything typed lives in
 *    `answers` and nothing on the error path reloads the assignment — losing
 *    twelve considered sentences to a dropped connection is how people stop
 *    writing anything but the ratings.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { review360Api } from '@/services/review360'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { formatDate } from '@/utils/format'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const loading = ref(true)
const submitting = ref(false)
const assignment = ref(null)
const answers = reactive({})
const invalid = ref(new Set())

const readOnly = computed(
  () => !assignment.value || assignment.value.status === 'SUBMITTED' || assignment.value.cycleStatus !== 'RUNNING'
)
const missingCount = computed(() => invalid.value.size)

function scaleValues(question) {
  return Array.from({ length: question.scaleMax ?? 5 }, (unused, index) => index + 1)
}

async function load() {
  loading.value = true
  try {
    const data = await review360Api.assignment(route.params.assignmentId)
    const given = new Map(data.answers.map((answer) => [answer.questionId, answer]))
    for (const question of data.questions) {
      answers[question.id] = {
        rating: given.get(question.id)?.rating ?? null,
        text: given.get(question.id)?.text ?? '',
      }
    }
    assignment.value = data
  } catch (error) {
    toast.error(apiErrorText(error, t('review360.respondNotFound')))
  } finally {
    loading.value = false
  }
}

function setRating(question, value) {
  answers[question.id].rating = value
  invalid.value.delete(question.id)
  invalid.value = new Set(invalid.value)
}

function onText(question) {
  if (answers[question.id].text.trim()) {
    invalid.value.delete(question.id)
    invalid.value = new Set(invalid.value)
  }
}

function isAnswered(question) {
  const answer = answers[question.id]
  return question.type === 'RATING' ? answer.rating !== null : Boolean(answer.text.trim())
}

/** The same rule the service applies, so the two never disagree. */
function validate() {
  const missing = new Set()
  for (const question of assignment.value.questions) {
    if (question.required && !isAnswered(question)) missing.add(question.id)
  }
  invalid.value = missing
  if (missing.size) {
    const first = document.getElementById(`question-${[...missing][0]}`)
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    first?.focus()
  }
  return missing.size === 0
}

async function submit() {
  if (!validate()) {
    toast.error(t('review360.respondMissing', { count: invalid.value.size }))
    return
  }
  submitting.value = true
  try {
    const payload = {
      answers: assignment.value.questions.map((question) => ({
        questionId: question.id,
        rating: question.type === 'RATING' ? answers[question.id].rating : null,
        text: answers[question.id].text.trim(),
      })),
    }
    await review360Api.respond(assignment.value.id, payload)
    toast.success(t('review360.respondSubmitted'))
    // Reloaded rather than patched locally: the server is what decides what
    // was stored, and this is also the moment the screen becomes read-only.
    await load()
  } catch (error) {
    // The server names the offending question when it refuses one; marking
    // it is the difference between "something is wrong" and "this one".
    const questionId = error?.response?.data?.details?.questionId
    if (questionId) {
      invalid.value = new Set([questionId])
      document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    toast.error(apiErrorText(error, t('review360.saveError')))
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>

  <div class="min-h-screen bg-bg pb-12">
    <!-- Full Width Hero Banner -->
    <div class="relative w-full bg-surface-2 flex items-end pt-24 pb-10">
      <div class="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800"></div>
      <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xNSIvPjwvc3ZnPg==')]"></div>
      
      <div class="relative z-10 w-full mx-auto max-w-[1440px] px-6 lg:px-8">
        <button
          type="button"
          class="mb-6 inline-flex items-center gap-1.5 text-small font-medium text-white/70 transition-default hover:text-white"
          @click="router.push({ name: 'my-reviews' })"
        >
          <Icon name="arrow-left" size="14" />
          {{ t('review360.mine') }}
        </button>
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md" v-if="assignment">
          {{ t('review360.respondAbout', { name: assignment.subject.fullName }) }}
        </h1>
        <h1 class="text-4xl font-bold text-white leading-tight drop-shadow-md" v-else>
          {{ t('review360.mine') }}
        </h1>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 pt-8">
      <div class="mx-auto max-w-4xl">

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-24 w-full rounded-lg" />
      <Skeleton v-for="n in 4" :key="n" class="h-24 w-full rounded-lg" />
    </div>

    <EmptyState
      v-else-if="!assignment"
      class="mt-6"
      icon="alert-circle"
      :title="t('review360.respondNotFound')"
      description=""
    />

    <template v-else>
      <AppCard class="mt-4 p-4">
        <div class="flex flex-wrap items-center gap-3">
          <Avatar :name="assignment.subject.fullName" :src="assignment.subject.avatar" size="lg" />
          <div class="min-w-0">
            <h2 class="text-h2 text-ink">{{ assignment.subject.fullName }}</h2>
            <p class="mt-0.5 text-small text-ink-muted">
              {{ assignment.subject.position }}
              <span v-if="assignment.subject.department">· {{ assignment.subject.department }}</span>
            </p>
            <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-faint">
              <span>{{ assignment.cycleName }}</span>
              <Badge variant="info" size="sm">
                {{ t('review360.respondAs', { group: t(`review360.group.${assignment.raterGroup}`) }) }}
              </Badge>
              <span v-if="assignment.dueAt">
                <Icon name="clock" size="11" class="mr-1 inline" />
                {{ t('review360.mineDue', { date: formatDate(assignment.dueAt, locale) }) }}
              </span>
            </p>
          </div>
        </div>

        <p
          class="mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-small"
          :class="assignment.anonymous ? 'bg-info-subtle text-info' : 'bg-surface-2 text-ink-muted'"
        >
          <Icon :name="assignment.anonymous ? 'eye-off' : 'user'" size="14" class="mt-0.5 shrink-0" />
          <span>
            {{
              assignment.anonymous
                ? t('review360.respondAnonymous', { threshold: assignment.anonymityThreshold })
                : t('review360.respondAttributed')
            }}
          </span>
        </p>

        <p v-if="assignment.status === 'SUBMITTED'" class="mt-2 text-small text-success">
          <Icon name="check-circle" size="14" class="mr-1 inline" />
          {{ t('review360.respondAlready') }}
        </p>
        <p v-else-if="assignment.cycleStatus !== 'RUNNING'" class="mt-2 text-small text-danger">
          {{ t('review360.respondClosed') }}
        </p>
      </AppCard>

      <p v-if="missingCount" class="mt-4 text-small text-danger" role="alert">
        {{ t('review360.respondMissing', { count: missingCount }) }}
      </p>

      <div class="mt-4 space-y-3">
        <AppCard
          v-for="(question, index) in assignment.questions"
          :id="`question-${question.id}`"
          :key="question.id"
          tabindex="-1"
          class="p-4"
          :class="invalid.has(question.id) ? 'border border-danger' : ''"
        >
          <!-- A rating is a radio group, not a row of buttons: arrow keys walk
               the scale and a screen reader announces "3 of 5" (12.4). -->
          <fieldset v-if="question.type === 'RATING'">
            <legend class="text-small font-medium text-ink">
              {{ index + 1 }}. {{ question.text }}
              <span v-if="question.required" class="text-danger" :title="t('review360.respondRequiredMark')">*</span>
            </legend>

            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <label v-for="value in scaleValues(question)" :key="value" class="cursor-pointer">
                <input
                  type="radio"
                  class="peer sr-only"
                  :name="`question-${question.id}-rating`"
                  :value="value"
                  :aria-required="question.required"
                  :checked="answers[question.id].rating === value"
                  :disabled="readOnly"
                  @change="setRating(question, value)"
                />
                <span
                  class="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-small text-ink-muted transition-default hover:bg-surface-2 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-disabled:opacity-60"
                >
                  {{ value }}
                </span>
              </label>
              <span class="ml-1 text-caption text-ink-faint">
                {{ t('review360.respondScaleHint', { max: question.scaleMax }) }}
              </span>
              <AppButton
                v-if="!readOnly && !question.required && answers[question.id].rating !== null"
                variant="ghost"
                size="sm"
                icon="close"
                :aria-label="t('review360.respondClearRating')"
                @click="answers[question.id].rating = null"
              />
            </div>

            <!-- A rating question may still carry a comment, and the service
                 stores it — it is the part that says what to do differently. -->
            <label class="mt-3 block">
              <span class="mb-1 block text-caption text-ink-faint">{{ t('review360.respondComment') }}</span>
              <textarea
                v-model="answers[question.id].text"
                rows="2"
                :disabled="readOnly"
                :placeholder="t('review360.respondCommentPlaceholder')"
                class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              />
            </label>
          </fieldset>

          <label v-else class="block">
            <span class="block text-small font-medium text-ink">
              {{ index + 1 }}. {{ question.text }}
              <span v-if="question.required" class="text-danger" :title="t('review360.respondRequiredMark')">*</span>
            </span>
            <textarea
              v-model="answers[question.id].text"
              rows="3"
              :aria-required="question.required"
              :disabled="readOnly"
              :placeholder="t('review360.respondTextPlaceholder')"
              class="mt-2 w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              @input="onText(question)"
            />
          </label>
        </AppCard>
      </div>

      <div v-if="!readOnly" class="mt-5 flex flex-wrap items-center justify-end gap-3">
        <p class="text-caption text-ink-faint">{{ t('review360.respondSubmitHint') }}</p>
        <AppButton :loading="submitting" icon="send" @click="submit">{{ t('review360.respondSubmit') }}</AppButton>
      </div>
    </template>
      </div>
    </div>
  </div>
</template>
