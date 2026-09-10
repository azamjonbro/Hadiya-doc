<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { assessmentsApi } from '@/services/assessments'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({ assessmentId: { type: String, required: true } })
const emit = defineEmits(['updated', 'removed'])

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const loading = ref(true)
const saving = ref(false)
const removing = ref(false)
const errorMessage = ref('')

const title = ref('')
const status = ref('DRAFT')
const passScorePercent = ref(70)
const pointsEnabled = ref(false)
const points = ref(10)
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
  loading.value = true
  errorMessage.value = ''
  try {
    const assessment = await assessmentsApi.getById(props.assessmentId)
    title.value = assessment.title
    status.value = assessment.status
    passScorePercent.value = assessment.passScorePercent
    pointsEnabled.value = assessment.pointsEnabled
    points.value = assessment.points
    questions.splice(
      0,
      questions.length,
      ...(assessment.questions.length
        ? assessment.questions.map((q) => ({ text: q.text, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }))
        : [emptyQuestion()])
    )
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const updated = await assessmentsApi.update(props.assessmentId, {
      title: title.value,
      passScorePercent: passScorePercent.value,
      pointsEnabled: pointsEnabled.value,
      points: points.value,
      questions: questions.map((q, order) => ({
        text: q.text,
        order,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      })),
    })
    emit('updated', updated)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    saving.value = false
  }
}

async function togglePublish() {
  try {
    const updated = await assessmentsApi.update(props.assessmentId, {
      status: status.value === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
    })
    status.value = updated.status
    emit('updated', updated)
  } catch (error) {
    // Publishing is refused for a test with no questions, among other
    // things — a reason worth reading rather than a button that shrugs.
    toast.error(apiErrorText(error, t('content.statusFailed')))
  }
}

async function removeAssessment() {
  if (!(await confirm.ask({ message: t('confirm.deleteAssessment') }))) return
  removing.value = true
  errorMessage.value = ''
  try {
    await assessmentsApi.remove(props.assessmentId)
    emit('removed')
  } catch (error) {
    errorMessage.value = apiErrorText(error)
    removing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mt-3 rounded-lg border border-border bg-surface p-4">
    <div class="flex items-center justify-between gap-3">
      <p class="text-small font-semibold text-ink">{{ t('assessment.title') }}</p>
      <AppButton variant="ghost" size="sm" icon="trash" :loading="removing" @click="removeAssessment">
        {{ t('assessment.remove') }}
      </AppButton>
    </div>

    <p v-if="errorMessage" class="mt-2 text-small text-danger">{{ errorMessage }}</p>

    <template v-if="!loading">
      <div class="mt-3 space-y-3">
        <AppInput v-model="title" :label="t('assessment.titleLabel')" />
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-40">
            <AppInput v-model.number="passScorePercent" type="number" min="0" max="100" :label="t('admin.assessment.passScore')" />
          </div>
          <label class="flex items-center gap-1.5 pb-2 text-small text-ink">
            <input v-model="pointsEnabled" type="checkbox" class="h-3.5 w-3.5 rounded border-border-strong text-primary" />
            {{ t('assessment.pointsEnabled') }}
          </label>
          <div v-if="pointsEnabled" class="w-24">
            <AppInput v-model.number="points" type="number" min="0" label="Points" />
          </div>
          <AppButton size="sm" variant="outline" @click="togglePublish">
            {{ status === 'PUBLISHED' ? t('assessment.unpublish') : t('assessment.publish') }}
          </AppButton>
        </div>
      </div>

      <div v-if="questions.length === 0" class="mt-4 text-small text-ink-faint">{{ t('assessment.empty') }}</div>
      <div class="mt-4 space-y-4">
        <div v-for="(question, qIndex) in questions" :key="qIndex" class="rounded-md border border-border-strong p-3">
          <div class="flex items-start gap-2">
            <span class="mt-2.5 shrink-0 text-caption font-semibold text-ink-faint">{{ qIndex + 1 }}.</span>
            <div class="flex-1">
              <AppInput v-model="question.text" :label="t('assessment.questionText')" />

              <div class="mt-3 space-y-2">
                <div v-for="(option, oIndex) in question.options" :key="oIndex" class="flex items-center gap-2">
                  <input
                    type="radio"
                    :name="`a-${qIndex}-correct`"
                    :checked="option.isCorrect"
                    class="h-4 w-4 shrink-0 text-primary"
                    @change="setCorrect(question, oIndex)"
                  />
                  <AppInput v-model="option.text" class="flex-1" :placeholder="t('assessment.optionPlaceholder')" />
                  <AppButton
                    v-if="question.options.length > 2"
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    @click="removeOption(question, oIndex)"
                  />
                </div>
                <AppButton v-if="question.options.length < 4" variant="ghost" size="sm" icon="plus" @click="addOption(question)">
                  {{ t('assessment.addOption') }}
                </AppButton>
              </div>
            </div>
            <AppButton v-if="questions.length > 1" variant="ghost" size="sm" icon="trash" @click="removeQuestion(qIndex)" />
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <AppButton variant="outline" size="sm" icon="plus" @click="addQuestion">{{ t('assessment.addQuestion') }}</AppButton>
        <AppButton size="sm" :loading="saving" @click="save">{{ t('assessment.save') }}</AppButton>
      </div>
    </template>
    <p v-else class="mt-3 flex items-center gap-1.5 text-small text-ink-faint">
      <Icon name="loader" size="14" />
    </p>
  </div>
</template>
