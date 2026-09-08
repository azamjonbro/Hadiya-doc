<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'imported'])

const { t } = useI18n()
const toast = useToast()

// Three states, one at a time: pick a file, look at what it would do, and
// then the credentials. Deliberately not a wizard that can be stepped back
// through — the middle step's numbers describe a specific parsed file, and
// "back" would invite committing a review of a different one.
const STEPS = { PICK: 'pick', REVIEW: 'review', DONE: 'done' }
const step = ref(STEPS.PICK)

const file = ref(null)
const busy = ref(false)
const plan = ref(null)
const result = ref(null)

const fileInput = ref(null)

const errorPreview = computed(() => (plan.value?.errors ?? []).slice(0, 8))
const hiddenErrors = computed(() => Math.max(0, (plan.value?.errors.length ?? 0) - errorPreview.value.length))
const nothingToDo = computed(() => plan.value && !plan.value.willCreate && !plan.value.willUpdate)

function reset() {
  step.value = STEPS.PICK
  file.value = null
  plan.value = null
  result.value = null
  busy.value = false
  if (fileInput.value) fileInput.value.value = ''
}

function close() {
  // Closing after a commit is the only way out of the credentials step, so
  // the parent is told to refresh exactly then.
  if (step.value === STEPS.DONE) emit('imported')
  emit('update:modelValue', false)
  reset()
}

function onFile(event) {
  file.value = event.target.files?.[0] ?? null
}

async function runDryRun() {
  if (!file.value) return
  busy.value = true
  try {
    plan.value = await usersApi.importDryRun(file.value)
    step.value = STEPS.REVIEW
  } catch (error) {
    toast.error(apiErrorText(error, t('userImport.dryRunFailed')))
  } finally {
    busy.value = false
  }
}

async function commit() {
  busy.value = true
  try {
    result.value = await usersApi.importCommit(plan.value.jobId)
    step.value = STEPS.DONE
  } catch (error) {
    toast.error(apiErrorText(error, t('userImport.commitFailed')))
  } finally {
    busy.value = false
  }
}

async function downloadErrors() {
  try {
    await usersApi.downloadImportErrors(plan.value.jobId)
  } catch (error) {
    toast.error(apiErrorText(error, t('userImport.reportFailed')))
  }
}

// The passwords exist in this response and nowhere else, so the only way to
// keep them is to take them off the screen before it closes.
function copyCredentials() {
  const text = result.value.credentials
    .map((row) => `${row.jshshir}\t${row.fullName}\t${row.password}`)
    .join('\n')
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(t('userImport.copied')))
    .catch(() => toast.error(t('userImport.copyFailed')))
}
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    size="lg"
    :title="t('userImport.title')"
    @update:model-value="close"
  >
    <!-- 1 · pick a file -->
    <template v-if="step === STEPS.PICK">
      <p class="text-small text-ink-muted">{{ t('userImport.pickHint') }}</p>
      <ul class="mt-3 space-y-1 text-caption text-ink-faint">
        <li>{{ t('userImport.columnsRequired') }}</li>
        <li>{{ t('userImport.columnsOptional') }}</li>
        <li>{{ t('userImport.columnsCurated') }}</li>
      </ul>

      <input
        ref="fileInput"
        type="file"
        accept=".xlsx"
        class="mt-4 block w-full text-small text-ink file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
        @change="onFile"
      />

      <div class="mt-5 flex justify-end gap-2">
        <AppButton variant="ghost" @click="close">{{ t('common.cancel') }}</AppButton>
        <AppButton :disabled="!file || busy" :loading="busy" @click="runDryRun">
          {{ t('userImport.check') }}
        </AppButton>
      </div>
    </template>

    <!-- 2 · what it would do -->
    <template v-else-if="step === STEPS.REVIEW">
      <div class="flex flex-wrap gap-3">
        <div class="rounded-md border border-border px-4 py-2">
          <div class="font-mono text-h2 tabular-nums text-ink">{{ plan.willCreate }}</div>
          <div class="text-caption text-ink-muted">{{ t('userImport.willCreate') }}</div>
        </div>
        <div class="rounded-md border border-border px-4 py-2">
          <div class="font-mono text-h2 tabular-nums text-ink">{{ plan.willUpdate }}</div>
          <div class="text-caption text-ink-muted">{{ t('userImport.willUpdate') }}</div>
        </div>
        <div class="rounded-md border border-border px-4 py-2">
          <div
            class="font-mono text-h2 tabular-nums"
            :class="plan.errors.length ? 'text-danger' : 'text-ink'"
          >
            {{ plan.errors.length }}
          </div>
          <div class="text-caption text-ink-muted">{{ t('userImport.errors') }}</div>
        </div>
      </div>

      <p class="mt-3 text-small text-ink-muted">
        {{ t('userImport.reviewHint', { total: plan.totalRows }) }}
      </p>

      <div v-if="plan.errors.length" class="mt-4">
        <div class="flex items-center justify-between">
          <h3 class="text-small font-semibold text-ink">{{ t('userImport.problems') }}</h3>
          <AppButton size="sm" variant="ghost" icon="download" @click="downloadErrors">
            {{ t('userImport.downloadReport') }}
          </AppButton>
        </div>
        <!-- Row number first, because that is the coordinate the operator
             can act on in their own file. -->
        <table class="mt-2 w-full border-collapse text-small">
          <thead>
            <tr class="border-b border-border text-caption text-ink-muted">
              <th class="w-16 py-1.5 pr-3 text-left font-medium">{{ t('userImport.columns.row') }}</th>
              <th class="w-32 py-1.5 pr-3 text-left font-medium">{{ t('userImport.columns.field') }}</th>
              <th class="py-1.5 text-left font-medium">{{ t('userImport.columns.problem') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(error, index) in errorPreview" :key="index" class="border-b border-border/60 last:border-0">
              <td class="py-1.5 pr-3 font-mono tabular-nums text-ink">{{ error.row }}</td>
              <td class="py-1.5 pr-3 font-mono text-caption text-ink-muted">{{ error.field }}</td>
              <td class="py-1.5 text-ink-muted">{{ error.message }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="hiddenErrors" class="mt-2 text-caption text-ink-faint">
          {{ t('userImport.moreErrors', { count: hiddenErrors }) }}
        </p>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-2">
        <span v-if="nothingToDo" class="text-small text-ink-muted">{{ t('userImport.nothingToDo') }}</span>
        <span v-else class="text-caption text-ink-faint">{{ t('userImport.commitWarning') }}</span>
        <div class="flex gap-2">
          <AppButton variant="ghost" @click="reset">{{ t('userImport.pickAnother') }}</AppButton>
          <AppButton :disabled="busy || nothingToDo" :loading="busy" @click="commit">
            {{ t('userImport.commit', { count: plan.willCreate }) }}
          </AppButton>
        </div>
      </div>
    </template>

    <!-- 3 · credentials, shown once -->
    <template v-else>
      <div class="flex items-center gap-2">
        <Icon name="check" class="h-5 w-5 text-success" />
        <span class="text-body text-ink">{{ t('userImport.done', { count: result.created }) }}</span>
      </div>

      <div class="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
        <p class="text-small text-ink">{{ t('userImport.passwordsOnce') }}</p>
      </div>

      <div v-if="result.failed.length" class="mt-3">
        <h3 class="text-small font-semibold text-ink">{{ t('userImport.someFailed') }}</h3>
        <ul class="mt-1 space-y-1 text-caption text-ink-muted">
          <li v-for="row in result.failed" :key="row.row">
            {{ t('userImport.columns.row') }} {{ row.row }} — {{ row.jshshir }} — {{ row.code }}
          </li>
        </ul>
      </div>

      <div class="mt-4 max-h-64 overflow-y-auto rounded-md border border-border">
        <table class="w-full border-collapse text-small">
          <thead class="sticky top-0 bg-surface-2">
            <tr class="border-b border-border text-caption text-ink-muted">
              <th class="py-1.5 pl-3 pr-3 text-left font-medium">JSHSHIR</th>
              <th class="py-1.5 pr-3 text-left font-medium">{{ t('userImport.columns.person') }}</th>
              <th class="py-1.5 pr-3 text-left font-medium">{{ t('userImport.columns.password') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.credentials" :key="row.jshshir" class="border-b border-border/60 last:border-0">
              <td class="py-1.5 pl-3 pr-3 font-mono tabular-nums text-ink-muted">{{ row.jshshir }}</td>
              <td class="py-1.5 pr-3 text-ink">{{ row.fullName }}</td>
              <td class="py-1.5 pr-3 font-mono text-ink">{{ row.password }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <AppButton variant="ghost" icon="copy" @click="copyCredentials">{{ t('userImport.copyAll') }}</AppButton>
        <AppButton @click="close">{{ t('common.close') }}</AppButton>
      </div>
    </template>
  </Modal>
</template>
