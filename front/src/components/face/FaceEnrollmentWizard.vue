<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import { useFaceEnrollment, MAX_ENROLLMENT_FRAMES } from '@/composables/useFaceEnrollment'
import { faceApi } from '@/services/face'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Empty in 'self' mode — the API takes the caller's own account there.
  userId: { type: String, default: '' },
  userName: { type: String, default: '' },
  mode: { type: String, default: 'enroll' }, // enroll | re-enroll | self
})
const emit = defineEmits(['update:modelValue', 'enrolled'])

const { t } = useI18n()
const toast = useToast()
const enrollment = useFaceEnrollment()

// 'self' is the employee setting up their own face, so it is addressed to
// them rather than describing a third person to an admin.
const titleForMode = computed(() => {
  if (props.mode === 'self') return t('faceVerification.enrollment.selfTitle')
  if (props.mode === 're-enroll') return t('faceVerification.enrollment.reEnrollTitle')
  return t('faceVerification.enrollment.title')
})

const step = ref('intro') // intro | capture | submitting | done
const errorMessage = ref('')
const cameraError = ref('')
const videoEl = ref(null)

// Watching the element as well as the stream, because the two arrive in the
// wrong order: start() resolves with a stream while the step is still
// 'intro', so the <video> it belongs to does not exist yet. Watching only the
// stream assigned it to nothing and left the preview black — even though the
// camera was running and the captured frames came out fine.
function attachStream() {
  if (videoEl.value) videoEl.value.srcObject = enrollment.cameraStream.value ?? null
}

watch([() => enrollment.cameraStream.value, videoEl], attachStream, { flush: 'post' })

async function onStartCamera() {
  errorMessage.value = ''
  cameraError.value = ''
  try {
    await enrollment.start()
    step.value = 'capture'
  } catch (error) {
    cameraError.value =
      error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        ? t('faceVerification.enrollment.cameraDenied')
        : error?.message ?? String(error)
  }
}

async function onCapture() {
  await enrollment.captureFrame()
}

const canSubmit = computed(() => enrollment.frames.value.length > 0)

async function onSubmit() {
  const previousStep = step.value
  step.value = 'submitting'
  errorMessage.value = ''
  try {
    const photos = enrollment.frames.value.map((frame) => frame.blob)
    if (props.mode === 'self') await faceApi.selfEnroll(photos)
    else if (props.mode === 're-enroll') await faceApi.reEnroll(props.userId, photos)
    else await faceApi.enroll(props.userId, photos)
    step.value = 'done'
    toast.success(t('faceVerification.enrollment.success'))
    emit('enrolled')
  } catch (error) {
    errorMessage.value = apiErrorText(error)
    step.value = previousStep
  }
}

function close() {
  enrollment.stop()
  step.value = 'intro'
  errorMessage.value = ''
  cameraError.value = ''
  emit('update:modelValue', false)
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="titleForMode"
    :description="userName"
    size="md"
    @update:model-value="close"
  >
    <div v-if="step === 'intro'" class="space-y-4 text-center">
      <Icon name="video" size="30" class="mx-auto text-primary" />
      <p class="text-small text-ink-muted">
        {{ mode === 'self' ? t('faceVerification.enrollment.selfIntro') : t('faceVerification.enrollment.intro') }}
      </p>
      <p v-if="cameraError" class="text-small text-danger">{{ cameraError }}</p>
      <AppButton variant="primary" @click="onStartCamera">{{ t('faceVerification.enrollment.startCamera') }}</AppButton>
    </div>

    <div v-else-if="step === 'capture' || step === 'submitting'" class="space-y-4">
      <div class="relative mx-auto aspect-video w-full max-w-sm overflow-hidden rounded-lg bg-black">
        <video ref="videoEl" autoplay playsinline muted class="h-full w-full -scale-x-100 object-cover" />
      </div>

      <p class="text-center text-small text-ink-muted">
        {{ t('faceVerification.enrollment.guidance') }}
      </p>

      <div class="flex items-center justify-center gap-2">
        <span
          v-for="i in MAX_ENROLLMENT_FRAMES"
          :key="i"
          class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border text-caption font-medium"
          :class="enrollment.frames.value[i - 1] ? 'border-success bg-success-subtle' : 'border-border-strong text-ink-faint'"
        >
          <img v-if="enrollment.frames.value[i - 1]" :src="enrollment.frames.value[i - 1].url" class="h-full w-full object-cover" />
          <span v-else>{{ i }}</span>
        </span>
      </div>
      <p class="text-center text-caption text-ink-faint">
        {{ t('faceVerification.enrollment.progress', { count: enrollment.frames.value.length, max: MAX_ENROLLMENT_FRAMES }) }}
      </p>

      <p v-if="errorMessage" class="text-center text-small text-danger">{{ errorMessage }}</p>

      <div class="flex items-center justify-center gap-3">
        <AppButton
          variant="outline"
          :disabled="enrollment.frames.value.length === 0"
          @click="enrollment.retake(enrollment.frames.value.length - 1)"
        >
          {{ t('faceVerification.enrollment.retake') }}
        </AppButton>
        <AppButton
          variant="secondary"
          :disabled="enrollment.frames.value.length >= MAX_ENROLLMENT_FRAMES"
          @click="onCapture"
        >
          {{ t('faceVerification.enrollment.capture') }}
        </AppButton>
      </div>
    </div>

    <div v-else-if="step === 'done'" class="space-y-3 text-center">
      <Icon name="check-circle" size="32" class="mx-auto text-success" />
      <p class="text-small text-ink">{{ t('faceVerification.enrollment.success') }}</p>
    </div>

    <template #footer>
      <AppButton v-if="step === 'done'" variant="primary" @click="close">{{ t('common.close') }}</AppButton>
      <template v-else-if="step === 'capture' || step === 'submitting'">
        <AppButton variant="ghost" :disabled="step === 'submitting'" @click="close">{{ t('common.cancel') }}</AppButton>
        <AppButton variant="primary" :loading="step === 'submitting'" :disabled="!canSubmit" @click="onSubmit">
          {{ t('faceVerification.enrollment.submit') }}
        </AppButton>
      </template>
      <AppButton v-else-if="step === 'intro'" variant="ghost" @click="close">{{ t('common.cancel') }}</AppButton>
    </template>
  </Modal>
</template>
