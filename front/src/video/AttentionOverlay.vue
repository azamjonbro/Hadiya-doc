<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

// Purely presentational: every decision about what the learner is shown is
// made by VideoPlayer.vue from the policy, so this file has no idea what the
// rules are — it only renders the state it is handed.
const props = defineProps({
  // 'consent' | 'loading' | 'calibrating' | 'warning' | 'lockout' | 'denied' | 'error'
  state: { type: String, required: true },
  reason: { type: String, default: null },
  lockoutRemaining: { type: Number, default: 0 },
  errorMessage: { type: String, default: '' },
})

// No "continue without the camera": once a course is monitored, the camera is
// the price of entry. Anyone who does not want it closes the lesson instead —
// an opt-out would make the whole policy advisory.
defineEmits(['accept', 'retry'])

const { t } = useI18n()

// Consent and lockout take the whole player; a warning dims it but leaves the
// frame readable, since the point is to bring the learner back to the video,
// not to hide it from them.
const isBlocking = computed(() => ['consent', 'lockout', 'denied', 'error'].includes(props.state))
</script>

<template>
  <div
    class="absolute inset-0 z-20 flex items-center justify-center p-6 text-center transition-default"
    :class="isBlocking ? 'bg-slate-950/92 backdrop-blur-md' : 'bg-slate-950/55 backdrop-blur-[2px]'"
  >
    <!-- Consent. Shown before the camera is ever requested, so the browser's
         own permission prompt is never the first thing the learner sees. -->
    <div v-if="state === 'consent'" class="max-w-md">
      <Icon name="video" size="32" class="mx-auto text-white/80" />
      <h3 class="mt-3 text-lg font-semibold text-white">{{ t('attention.consent.title') }}</h3>
      <p class="mt-2 text-sm leading-relaxed text-white/70">{{ t('attention.consent.body') }}</p>
      <p class="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs leading-relaxed text-white/70">
        {{ t('attention.consent.privacy') }}
      </p>
      <div class="mt-5 flex items-center justify-center">
        <AppButton variant="primary" @click="$emit('accept')">{{ t('attention.consent.accept') }}</AppButton>
      </div>
      <p class="mt-3 text-xs text-amber-300">{{ t('attention.consent.requiredHint') }}</p>
    </div>

    <div v-else-if="state === 'loading' || state === 'calibrating'" class="max-w-sm">
      <Icon name="loader" size="26" class="mx-auto animate-spin text-white/70" />
      <p class="mt-3 text-sm text-white/80">
        {{ state === 'loading' ? t('attention.loading') : t('attention.calibrating') }}
      </p>
    </div>

    <!-- Warning: the learner looked away. Deliberately loud but not modal. -->
    <div v-else-if="state === 'warning'" class="max-w-sm">
      <Icon name="alert-triangle" size="30" class="mx-auto text-amber-400" />
      <h3 class="mt-3 text-lg font-semibold text-white">{{ t('attention.warning.title') }}</h3>
      <p class="mt-1.5 text-sm text-white/75">
        {{ reason === 'noFace' ? t('attention.warning.noFace') : t('attention.warning.lookingAway') }}
      </p>
      <p class="mt-2 text-xs text-white/55">{{ t('attention.warning.resumeHint') }}</p>
    </div>

    <!-- Lockout: repeated warnings, playback held for a fixed countdown. -->
    <div v-else-if="state === 'lockout'" class="max-w-sm">
      <Icon name="lock" size="30" class="mx-auto text-danger" />
      <h3 class="mt-3 text-lg font-semibold text-white">{{ t('attention.lockout.title') }}</h3>
      <p class="mt-1.5 text-sm text-white/75">{{ t('attention.lockout.body') }}</p>
      <p class="mt-4 font-mono text-4xl font-semibold tabular-nums text-white">{{ lockoutRemaining }}</p>
      <p class="mt-1 text-xs text-white/55">{{ t('attention.lockout.seconds') }}</p>
    </div>

    <div v-else-if="state === 'denied' || state === 'error'" class="max-w-md">
      <Icon name="alert-circle" size="30" class="mx-auto text-danger" />
      <h3 class="mt-3 text-lg font-semibold text-white">
        {{ state === 'denied' ? t('attention.denied.title') : t('attention.error.title') }}
      </h3>
      <p class="mt-2 text-sm leading-relaxed text-white/70">
        {{ state === 'denied' ? t('attention.denied.body') : errorMessage || t('attention.error.body') }}
      </p>
      <div class="mt-5 flex items-center justify-center">
        <AppButton variant="primary" @click="$emit('retry')">{{ t('attention.denied.retry') }}</AppButton>
      </div>
      <p class="mt-3 text-xs text-white/50">{{ t('attention.denied.noBypass') }}</p>
    </div>
  </div>
</template>
