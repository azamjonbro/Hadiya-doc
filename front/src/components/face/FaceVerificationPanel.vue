<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

// Purely presentational, reused in two visual contexts: inline on the login
// page (variant="inline", themed like the rest of the page) and as a
// full-cover overlay on the video player (variant="overlay", always-dark —
// same treatment as AttentionOverlay.vue, which it deliberately mirrors so
// the two camera-driven overlays this app shows feel like one family).
const props = defineProps({
  // idle | requestingCamera | detecting | verifying | success | failed | denied | error | locked
  state: { type: String, required: true },
  errorMessage: { type: String, default: '' },
  variant: { type: String, default: 'inline' }, // inline | overlay
  // Overrides the "why you are being asked" line. The login page's default
  // sentence says the check is a once-a-day thing, which stops being true
  // when the gate is standing in front of a material or a test, or when the
  // policy asks for a check every time — so whoever put the gate up says
  // what it is for.
  bodyText: { type: String, default: '' },
  // The live camera stream, handed down by whoever is driving the capture
  // (useFaceVerification). Optional: the panel still renders its states
  // without one, it simply has nothing to show.
  stream: { type: Object, default: null },
})

defineEmits(['start', 'retry'])

const { t } = useI18n()

const videoEl = ref(null)

// While the camera is open, being photographed blind is unnerving — you
// cannot tell whether you are in frame, lit, or looking the right way. Both
// the element and the stream are watched because they arrive in either order
// depending on which state the panel is in when the stream opens.
const showPreview = computed(() =>
  Boolean(props.stream) && ['requestingCamera', 'detecting', 'verifying'].includes(props.state)
)

function attachStream() {
  if (videoEl.value) videoEl.value.srcObject = props.stream ?? null
}

watch([() => props.stream, videoEl], attachStream, { flush: 'post' })

const isDark = computed(() => props.variant === 'overlay')
const titleClass = computed(() => (isDark.value ? 'text-white' : 'text-ink'))
const bodyClass = computed(() => (isDark.value ? 'text-white/70' : 'text-ink-muted'))
const faintClass = computed(() => (isDark.value ? 'text-white/50' : 'text-ink-faint'))
</script>

<template>
  <div class="flex flex-col items-center p-6 text-center">
    <div v-if="state === 'idle'" class="max-w-md">
      <Icon name="video" size="32" :class="isDark ? 'text-white/80' : 'text-primary'" class="mx-auto" />
      <h3 class="mt-3 text-lg font-semibold" :class="titleClass">{{ t('faceVerification.panel.title') }}</h3>
      <p class="mt-2 text-sm leading-relaxed" :class="bodyClass">{{ bodyText || t('faceVerification.panel.body') }}</p>
      <p
        class="mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed"
        :class="isDark ? 'bg-white/10 text-white/70' : 'bg-surface-2 text-ink-muted'"
      >
        {{ t('faceVerification.panel.privacy') }}
      </p>
      <div class="mt-5 flex items-center justify-center">
        <AppButton variant="primary" @click="$emit('start')">{{ t('faceVerification.panel.start') }}</AppButton>
      </div>
    </div>

    <div v-else-if="state === 'requestingCamera' || state === 'detecting'" class="max-w-sm">
      <!-- Mirrored, like a mirror: a preview that moves the opposite way when
           you lean makes people correct in the wrong direction. Only the
           preview — the frame that is sent is the one the camera saw. -->
      <div v-if="showPreview" class="mx-auto mb-4 aspect-video w-full max-w-xs overflow-hidden rounded-lg bg-black">
        <video ref="videoEl" autoplay playsinline muted class="h-full w-full -scale-x-100 object-cover" />
      </div>
      <Icon
        v-else
        name="loader"
        size="26"
        class="mx-auto animate-spin"
        :class="isDark ? 'text-white/70' : 'text-ink-faint'"
      />
      <p class="mt-3 text-sm" :class="bodyClass">
        {{ state === 'requestingCamera' ? t('faceVerification.panel.requestingCamera') : t('faceVerification.panel.detecting') }}
      </p>
    </div>

    <div v-else-if="state === 'verifying'" class="max-w-sm">
      <div v-if="showPreview" class="mx-auto mb-4 aspect-video w-full max-w-xs overflow-hidden rounded-lg bg-black">
        <video ref="videoEl" autoplay playsinline muted class="h-full w-full -scale-x-100 object-cover" />
      </div>
      <Icon
        v-else
        name="loader"
        size="26"
        class="mx-auto animate-spin"
        :class="isDark ? 'text-white/70' : 'text-ink-faint'"
      />
      <p class="mt-3 text-sm" :class="bodyClass">{{ t('faceVerification.panel.verifying') }}</p>
    </div>

    <div v-else-if="state === 'success'" class="max-w-sm">
      <Icon name="check-circle" size="32" class="mx-auto text-success" />
      <h3 class="mt-3 text-lg font-semibold" :class="titleClass">{{ t('faceVerification.panel.successTitle') }}</h3>
      <p class="mt-1.5 text-sm" :class="bodyClass">{{ t('faceVerification.panel.successBody') }}</p>
    </div>

    <div v-else-if="state === 'failed'" class="max-w-md">
      <Icon name="alert-circle" size="30" class="mx-auto text-danger" />
      <h3 class="mt-3 text-lg font-semibold" :class="titleClass">{{ t('faceVerification.panel.failedTitle') }}</h3>
      <p class="mt-2 text-sm leading-relaxed" :class="bodyClass">{{ t('faceVerification.panel.failedBody') }}</p>
      <div class="mt-5 flex items-center justify-center">
        <AppButton variant="primary" @click="$emit('retry')">{{ t('faceVerification.panel.tryAgain') }}</AppButton>
      </div>
    </div>

    <div v-else-if="state === 'locked'" class="max-w-md">
      <Icon name="lock" size="30" class="mx-auto text-danger" />
      <h3 class="mt-3 text-lg font-semibold" :class="titleClass">{{ t('faceVerification.panel.lockedTitle') }}</h3>
      <p class="mt-2 text-sm leading-relaxed" :class="bodyClass">{{ t('faceVerification.panel.lockedBody') }}</p>
    </div>

    <div v-else-if="state === 'denied' || state === 'error'" class="max-w-md">
      <Icon name="alert-circle" size="30" class="mx-auto text-danger" />
      <h3 class="mt-3 text-lg font-semibold" :class="titleClass">
        {{ state === 'denied' ? t('faceVerification.panel.deniedTitle') : t('faceVerification.panel.errorTitle') }}
      </h3>
      <p class="mt-2 text-sm leading-relaxed" :class="bodyClass">
        {{ state === 'denied' ? t('faceVerification.panel.deniedBody') : errorMessage || t('faceVerification.panel.errorBody') }}
      </p>
      <div class="mt-5 flex items-center justify-center">
        <AppButton variant="primary" @click="$emit('retry')">{{ t('faceVerification.panel.tryAgain') }}</AppButton>
      </div>
    </div>

    <p v-if="['idle', 'requestingCamera', 'detecting', 'verifying'].includes(state)" class="mt-4 text-xs" :class="faintClass">
      {{ t('faceVerification.panel.noBypass') }}
    </p>
  </div>
</template>
