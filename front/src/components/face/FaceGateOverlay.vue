<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import FaceVerificationPanel from '@/components/face/FaceVerificationPanel.vue'
import FaceEnrollmentWizard from '@/components/face/FaceEnrollmentWizard.vue'

/**
 * The full-cover half of the face gate: one dark sheet over whatever was
 * about to open, holding either the verification panel or the first-use
 * enrollment wizard. Presentational, like FaceVerificationPanel itself —
 * useFaceGate.js owns the state machine, this only renders it.
 *
 * Rendered by the video player, the material reader and the test page, which
 * is the whole reason it exists as a component instead of a block of template
 * copied into three files.
 */
const props = defineProps({
  // See useFaceGate: 'none' | 'enroll' | the panel's own states.
  state: { type: String, required: true },
  errorMessage: { type: String, default: '' },
  // One of FACE_GATE_ACTIONS — decides which sentence names what is behind
  // the gate ("before this lesson plays" / "before this material opens").
  action: { type: String, default: 'video' },
  stream: { type: Object, default: null },
  showEnrollment: { type: Boolean, default: false },
  // The player and the reader put the gate over their own frame; a page with
  // no frame of its own (the test) covers the window instead.
  fullPage: { type: Boolean, default: false },
})

const emit = defineEmits(['capture', 'enrolled', 'update:showEnrollment'])

const { t } = useI18n()

const bodyText = computed(() => t(`faceVerification.gate.${props.action}`))

const enrollmentOpen = computed({
  get: () => props.showEnrollment,
  set: (value) => emit('update:showEnrollment', value),
})
</script>

<template>
  <div
    class="inset-0 flex items-center justify-center bg-slate-950/92 backdrop-blur-md"
    :class="fullPage ? 'fixed z-40' : 'absolute z-30'"
  >
    <FaceVerificationPanel
      v-if="state !== 'enroll'"
      :state="state"
      :body-text="bodyText"
      :error-message="errorMessage"
      :stream="stream"
      variant="overlay"
      @start="emit('capture')"
      @retry="emit('capture')"
    />

    <!-- The enrolment case keeps its own prompt rather than borrowing the
         verification panel: it is also what the employee comes back to if
         they close the wizard, so the gate never becomes an empty screen
         with no way forward. -->
    <div v-else class="mx-4 max-w-sm space-y-4 rounded-xl bg-surface p-6 text-center">
      <Icon name="video" size="28" class="mx-auto text-primary" />
      <p class="text-small text-ink-muted">{{ t('faceVerification.enrollment.selfIntro') }}</p>
      <button
        type="button"
        class="w-full rounded-md bg-primary px-4 py-2.5 text-small font-medium text-primary-foreground transition-default hover:opacity-90"
        @click="enrollmentOpen = true"
      >
        {{ t('faceVerification.enrollment.startCamera') }}
      </button>
    </div>

    <FaceEnrollmentWizard v-model="enrollmentOpen" mode="self" @enrolled="emit('enrolled')" />
  </div>
</template>
