<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { quizzesApi } from '@/services/quizzes'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  videoId: { type: String, required: true },
  hasQuiz: { type: Boolean, default: false },
})
const emit = defineEmits(['updated'])

const { t } = useI18n()

const loading = ref(false)
const saving = ref(false)
const removing = ref(false)
const errorMessage = ref('')

const passScorePercent = ref(70)
const questions = reactive([])

function emptyQuestion() {
  return {
    text: '',
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
  }
}

function addQuestion() {
  questions.push(emptyQuestion())
}

function removeQuestion(index) {
  questions.splice(index, 1)
}

function addOption(question) {
  if (question.options.length >= 4) return
  question.options.push({ text: '', isCorrect: false })
}

function removeOption(question, index) {
  if (question.options.length <= 2) return
  const wasCorrect = question.options[index].isCorrect
  question.options.splice(index, 1)
  if (wasCorrect) question.options[0].isCorrect = true
}

function setCorrect(question, index) {
  question.options.forEach((o, i) => {
    o.isCorrect = i === index
  })
}

async function load() {
  if (!props.hasQuiz) {
    questions.splice(0, questions.length, emptyQuestion())
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const quiz = await quizzesApi.getQuiz(props.videoId)
    if (quiz) {
      passScorePercent.value = quiz.passScorePercent
      questions.splice(
        0,
        questions.length,
        ...quiz.questions.map((q) => ({ text: q.text, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }))
      )
    } else {
      questions.splice(0, questions.length, emptyQuestion())
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await quizzesApi.upsertQuiz(props.videoId, {
      passScorePercent: passScorePercent.value,
      questions: questions.map((q, order) => ({
        text: q.text,
        order,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      })),
    })
    emit('updated', true)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function removeQuiz() {
  removing.value = true
  errorMessage.value = ''
  try {
    await quizzesApi.removeQuiz(props.videoId)
    questions.splice(0, questions.length, emptyQuestion())
    emit('updated', false)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    removing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface p-4">
    <div class="flex items-center justify-between gap-3">
      <p class="text-small font-semibold text-ink">{{ t('quiz.title') }}</p>
      <AppButton v-if="hasQuiz" variant="ghost" size="sm" icon="trash" :loading="removing" @click="removeQuiz">
        {{ t('quiz.remove') }}
      </AppButton>
    </div>

    <p v-if="errorMessage" class="mt-2 text-small text-danger">{{ errorMessage }}</p>

    <template v-if="!loading">
      <div class="mt-3 w-40">
        <AppInput v-model.number="passScorePercent" type="number" min="0" max="100" :label="t('quiz.passScore')" />
      </div>

      <div class="mt-4 space-y-4">
        <div v-for="(question, qIndex) in questions" :key="qIndex" class="rounded-md border border-border-strong p-3">
          <div class="flex items-start gap-2">
            <span class="mt-2.5 shrink-0 text-caption font-semibold text-ink-faint">{{ qIndex + 1 }}.</span>
            <div class="flex-1">
              <AppInput v-model="question.text" :label="t('quiz.questionText')" />

              <div class="mt-3 space-y-2">
                <div v-for="(option, oIndex) in question.options" :key="oIndex" class="flex items-center gap-2">
                  <input
                    type="radio"
                    :name="`q-${qIndex}-correct`"
                    :checked="option.isCorrect"
                    class="h-4 w-4 shrink-0 text-primary"
                    @change="setCorrect(question, oIndex)"
                  />
                  <AppInput v-model="option.text" class="flex-1" :placeholder="t('quiz.optionPlaceholder')" />
                  <AppButton
                    v-if="question.options.length > 2"
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    @click="removeOption(question, oIndex)"
                  />
                </div>
                <AppButton v-if="question.options.length < 4" variant="ghost" size="sm" icon="plus" @click="addOption(question)">
                  {{ t('quiz.addOption') }}
                </AppButton>
              </div>
            </div>
            <AppButton v-if="questions.length > 1" variant="ghost" size="sm" icon="trash" @click="removeQuestion(qIndex)" />
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <AppButton variant="outline" size="sm" icon="plus" @click="addQuestion">{{ t('quiz.addQuestion') }}</AppButton>
        <AppButton size="sm" :loading="saving" @click="save">{{ t('quiz.save') }}</AppButton>
      </div>
    </template>
    <p v-else class="mt-3 text-small text-ink-faint">{{ t('videos.title') }}...</p>
  </div>
</template>
