<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ATTENTION_POLICY_DEFAULTS, ATTENTION_POLICY_FIELDS } from '@lms/shared'
import { useToast } from '@/composables/useToast'
import { attentionPolicyApi } from '@/services/attentionPolicy'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Icon from '@/components/ui/Icon.vue'

// Drives both the global rules page and the per-course override panel. The
// only real difference is what "inherit" falls back to — the built-in
// defaults for the global scope, the global policy for a course — so the
// layer being edited is a prop rather than two near-identical forms.
const props = defineProps({
  // '' for the global policy, a course id for a course override.
  courseId: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
})

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
// Values stored at this layer. A field missing here is inherited.
const stored = reactive({})
// What each field resolves to when this layer says nothing about it.
const inherited = ref({})
const hasOverride = ref(false)

const isCourseScope = computed(() => Boolean(props.courseId))

// Ranges are enforced by the API validator; the hint text carries them for
// the reader rather than being duplicated as attributes here.
const NUMERIC_FIELDS = ['graceSeconds', 'lockoutAfterWarnings', 'lockoutSeconds', 'notifyManagerAfter']

const BOOLEAN_FIELDS = ['enabled', 'pauseOnWarning', 'requireRewatch']

function applyResponse(data) {
  for (const field of ATTENTION_POLICY_FIELDS) delete stored[field]
  Object.assign(stored, data.stored ?? {})
  // What an unset field falls back to: the global policy for a course, and
  // the built-in defaults for the global scope itself.
  inherited.value = data.inherited ?? ATTENTION_POLICY_DEFAULTS
  hasOverride.value = data.hasOverride ?? Object.keys(data.stored ?? {}).length > 0
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    applyResponse(
      isCourseScope.value
        ? await attentionPolicyApi.getForCourse(props.courseId)
        : await attentionPolicyApi.getGlobal()
    )
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

watch(() => props.courseId, load, { immediate: true })

function isSet(field) {
  return stored[field] !== undefined
}

function valueOf(field) {
  return isSet(field) ? stored[field] : inherited.value[field]
}

function setField(field, value) {
  stored[field] = value
}

// Hands one field back to the layer above. The null survives all the way to
// the API, which turns it into an unset.
function resetField(field) {
  stored[field] = null
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    // Only fields this layer has an opinion about are sent; `null` entries
    // ride along on purpose, since that is the instruction to unset them.
    const payload = {}
    for (const field of ATTENTION_POLICY_FIELDS) {
      if (field in stored) payload[field] = stored[field]
    }
    if (Object.keys(payload).length === 0) {
      toast.info(t('attention.admin.nothingToSave'))
      return
    }
    applyResponse(
      isCourseScope.value
        ? await attentionPolicyApi.updateForCourse(props.courseId, payload)
        : await attentionPolicyApi.updateGlobal(payload)
    )
    toast.success(t('attention.admin.saved'))
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}

async function resetAll() {
  saving.value = true
  try {
    applyResponse(await attentionPolicyApi.resetForCourse(props.courseId))
    toast.success(t('attention.admin.resetDone'))
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="loading" class="text-small text-ink-faint">{{ t('common.loading') }}</p>

    <template v-else>
      <div class="space-y-4">
        <!-- Booleans first: `enabled` gates everything below it, so the
             switches read as the shape of the policy before the numbers. -->
        <label v-for="field in BOOLEAN_FIELDS" :key="field" class="flex items-start gap-3">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 rounded border-border-strong text-primary"
            :checked="Boolean(valueOf(field))"
            :disabled="readonly"
            @change="setField(field, $event.target.checked)"
          />
          <span class="flex-1">
            <span class="flex flex-wrap items-center gap-2 text-small text-ink">
              {{ t(`attention.admin.fields.${field}.label`) }}
              <button
                v-if="isCourseScope && isSet(field)"
                type="button"
                class="inline-flex items-center gap-1 rounded bg-primary-subtle px-1.5 py-0.5 text-caption text-primary"
                :title="t('attention.admin.resetField')"
                @click="resetField(field)"
              >
                <Icon name="refresh" size="11" />
                {{ t('attention.admin.overridden') }}
              </button>
            </span>
            <span class="mt-0.5 block text-caption text-ink-faint">
              {{ t(`attention.admin.fields.${field}.hint`) }}
            </span>
          </span>
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
          <div v-for="field in NUMERIC_FIELDS" :key="field">
            <AppInput
              type="number"
              :model-value="valueOf(field)"
              :label="t(`attention.admin.fields.${field}.label`)"
              :hint="t(`attention.admin.fields.${field}.hint`)"
              :disabled="readonly"
              @update:model-value="setField(field, Number($event))"
            />
            <button
              v-if="isCourseScope && isSet(field)"
              type="button"
              class="mt-1 inline-flex items-center gap-1 text-caption text-primary"
              @click="resetField(field)"
            >
              <Icon name="refresh" size="11" />
              {{ t('attention.admin.inheritInstead', { value: inherited[field] }) }}
            </button>
          </div>
        </div>
      </div>

      <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

      <div v-if="!readonly" class="mt-5 flex flex-wrap items-center gap-3">
        <AppButton :loading="saving" @click="save">{{ t('attention.admin.save') }}</AppButton>
        <AppButton v-if="isCourseScope && hasOverride" variant="ghost" :disabled="saving" @click="resetAll">
          {{ t('attention.admin.resetAll') }}
        </AppButton>
        <p v-if="isCourseScope && !hasOverride" class="text-caption text-ink-faint">
          {{ t('attention.admin.inheritingAll') }}
        </p>
      </div>
    </template>
  </div>
</template>
