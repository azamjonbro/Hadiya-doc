<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { courseQuestionsApi } from '@/services/courseQuestions'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({ courseId: { type: String, required: true } })

const { t, locale } = useI18n()
const auth = useAuthStore()
const toast = useToast()

const loading = ref(true)
const items = ref([])
const newQuestion = ref('')
const asking = ref(false)
const answerDrafts = reactive({})
const answering = reactive({})
const openAnswerBox = reactive({})

async function load() {
  loading.value = true
  try {
    const result = await courseQuestionsApi.list(props.courseId, { limit: 50 })
    items.value = result.items
  } finally {
    loading.value = false
  }
}

async function ask() {
  if (!newQuestion.value.trim()) return
  asking.value = true
  try {
    await courseQuestionsApi.create(props.courseId, { question: newQuestion.value.trim() })
    newQuestion.value = ''
    toast.success(t('qa.posted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('qa.error')))
  } finally {
    asking.value = false
  }
}

async function submitAnswer(questionId) {
  const text = (answerDrafts[questionId] ?? '').trim()
  if (!text) return
  answering[questionId] = true
  try {
    await courseQuestionsApi.answer(props.courseId, questionId, { answer: text })
    answerDrafts[questionId] = ''
    openAnswerBox[questionId] = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('qa.error')))
  } finally {
    answering[questionId] = false
  }
}

async function removeQuestion(questionId) {
  try {
    await courseQuestionsApi.remove(props.courseId, questionId)
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('qa.error')))
  }
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(locale.value)
}

onMounted(load)
</script>

<template>
  <div>
    <div class="rounded-lg border border-border bg-surface p-4">
      <textarea
        v-model="newQuestion"
        rows="2"
        :placeholder="t('qa.askPlaceholder')"
        class="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-small text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
      <AppButton class="mt-3" size="sm" :disabled="!newQuestion.trim()" :loading="asking" @click="ask">{{ t('qa.ask') }}</AppButton>
    </div>

    <div class="mt-5 space-y-3">
      <template v-if="loading">
        <Skeleton v-for="i in 3" :key="i" class="h-20 w-full" />
      </template>
      <EmptyState v-else-if="items.length === 0" icon="message-square" :title="t('qa.empty')" />

      <div v-else v-for="q in items" :key="q.id" class="rounded-lg border border-border bg-surface p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-2.5">
            <Avatar :name="q.fullName" size="sm" />
            <div>
              <p class="text-small text-ink">{{ q.question }}</p>
              <p class="mt-1 text-caption text-ink-faint">{{ q.fullName }} · {{ formatDate(q.createdAt) }}</p>
            </div>
          </div>
          <button
            v-if="q.userId === auth.user?.id || auth.hasPermission('course:update')"
            type="button"
            class="shrink-0 text-ink-faint hover:text-danger"
            @click="removeQuestion(q.id)"
          >
            <Icon name="trash" size="14" />
          </button>
        </div>

        <div v-if="q.answers.length" class="mt-3 space-y-2.5 border-t border-border pt-3 pl-9">
          <div v-for="a in q.answers" :key="a.id" class="flex items-start gap-2.5">
            <Avatar :name="a.fullName" size="xs" />
            <div>
              <p class="text-small text-ink-muted">{{ a.answer }}</p>
              <p class="mt-0.5 text-caption text-ink-faint">{{ a.fullName }} · {{ formatDate(a.createdAt) }}</p>
            </div>
          </div>
        </div>

        <div class="mt-3 pl-9">
          <button v-if="!openAnswerBox[q.id]" type="button" class="text-caption font-medium text-primary hover:underline" @click="openAnswerBox[q.id] = true">
            {{ t('qa.answer') }}
          </button>
          <div v-else class="flex items-center gap-2">
            <input
              v-model="answerDrafts[q.id]"
              type="text"
              :placeholder="t('qa.answerPlaceholder')"
              class="h-8 flex-1 rounded-md border border-border-strong bg-surface px-2.5 text-small text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              @keyup.enter="submitAnswer(q.id)"
            />
            <AppButton size="sm" :loading="answering[q.id]" @click="submitAnswer(q.id)">{{ t('qa.answer') }}</AppButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
