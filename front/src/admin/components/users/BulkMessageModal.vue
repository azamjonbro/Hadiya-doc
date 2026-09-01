<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import SelectedUsersPreview from './SelectedUsersPreview.vue'

// One message, written once, delivered as a *separate private conversation*
// to every selected employee — not a group. The server does the fan-out
// (POST /users/bulk/message) so the browser makes one request no matter how
// many people are ticked, and the recipients each get an ordinary DM they can
// answer without the others seeing it.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  users: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'sent'])

const { t } = useI18n()
const toast = useToast()

const MAX_LENGTH = 4000

const body = ref('')
const sending = ref(false)
const errorMessage = ref('')

const userIds = computed(() => props.users.map((user) => user.id))
const canSend = computed(() => body.value.trim().length > 0 && userIds.value.length > 0)

// Reopening starts clean — a draft left over from a previous, different
// selection is the wrong message to send to the wrong people.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    body.value = ''
    errorMessage.value = ''
  }
)

async function onSend() {
  if (!canSend.value || sending.value) return

  sending.value = true
  errorMessage.value = ''
  try {
    const result = await usersApi.bulkMessage({ userIds: userIds.value, message: body.value.trim() })

    if (result.sent > 0) toast.success(t('users.bulk.messageSent', { count: result.sent }))
    // Partial delivery is reported, never swallowed: an admin who thinks all
    // four were written to has to know when only three were.
    const notSent = (result.failed?.length ?? 0) + (result.skipped?.length ?? 0)
    if (notSent > 0) toast.warning(t('users.bulk.messageNotSent', { count: notSent }))

    // Closed before the page is told, so the roster preview does not blink
    // empty while the modal is still fading out.
    emit('update:modelValue', false)
    emit('sent', result)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="t('users.bulk.messageTitle')"
    @update:model-value="!sending && emit('update:modelValue', $event)"
  >
    <form id="bulk-message-form" class="space-y-4" @submit.prevent="onSend">
      <SelectedUsersPreview :users="users" :label="t('users.bulk.selectedEmployees', { count: users.length })" />

      <div>
        <label for="bulk-message-body" class="mb-1.5 block text-small font-medium text-ink">
          {{ t('users.bulk.messageLabel') }}
        </label>
        <textarea
          id="bulk-message-body"
          v-model="body"
          rows="5"
          :maxlength="MAX_LENGTH"
          :placeholder="t('users.bulk.messagePlaceholder')"
          :disabled="sending"
          class="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
        />
        <div class="mt-1 flex items-center justify-between gap-3">
          <p class="text-caption text-ink-faint">{{ t('users.bulk.messageHint') }}</p>
          <p class="shrink-0 text-caption text-ink-faint">{{ body.length }}/{{ MAX_LENGTH }}</p>
        </div>
      </div>

      <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
    </form>

    <template #footer>
      <AppButton variant="ghost" :disabled="sending" @click="emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </AppButton>
      <AppButton type="submit" form="bulk-message-form" icon="send" :loading="sending" :disabled="!canSend">
        {{ t('users.bulk.send') }}
      </AppButton>
    </template>
  </Modal>
</template>
