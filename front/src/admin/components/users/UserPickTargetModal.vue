<script setup>
/**
 * "Do X to these people" where X needs one thing chosen first — a course to
 * assign, an event to sign up for, a department to move to, a group chat to
 * join, a name for a new chat. One modal, five `kind`s: they all ask one
 * question, show the same roster, and end in one request. The list view's
 * selection bar and the ⋯ on a profile both open it.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { coursesApi } from '@/services/courses'
import { eventsApi } from '@/services/events'
import { usersApi } from '@/services/users'
import { chatApi } from '@/services/chat'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { formatDateTime } from '@/utils/format'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppInput from '@/components/ui/AppInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SelectedUsersPreview from './SelectedUsersPreview.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // course | event | department | chat-create | chat-add
  kind: { type: String, required: true },
  users: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'done'])

const { t, locale } = useI18n()
const toast = useToast()

const options = ref([])
const loading = ref(false)
const loadError = ref('')
const choice = ref('')
const text = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const isText = computed(() => props.kind === 'chat-create')
const canSubmit = computed(() => props.users.length > 0 && (isText.value ? text.value.trim().length > 0 : Boolean(choice.value)))

const copy = computed(() => ({
  title: t(`users.actions.${props.kind}.title`),
  hint: t(`users.actions.${props.kind}.hint`),
  choose: t(`users.actions.${props.kind}.choose`),
  submit: t(`users.actions.${props.kind}.submit`),
  empty: t(`users.actions.${props.kind}.empty`),
}))

async function loadOptions() {
  loading.value = true
  loadError.value = ''
  try {
    if (props.kind === 'course') {
      const result = await coursesApi.list({ status: 'PUBLISHED', limit: 100 })
      options.value = result.items.map((c) => ({ value: c.id, label: c.title }))
    } else if (props.kind === 'event') {
      // Upcoming only: signing somebody up for last week's meeting is a
      // mistake the picker should not offer.
      const from = new Date()
      const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
      const rows = await eventsApi.calendar({ from: from.toISOString(), to: to.toISOString() })
      options.value = rows
        .filter((e) => e.status !== 'CANCELLED')
        .map((e) => ({ value: e.id, label: `${e.title} · ${formatDateTime(e.startAt, locale.value)}` }))
    } else if (props.kind === 'department') {
      const names = await usersApi.departments()
      options.value = names.map((name) => ({ value: name, label: name }))
    } else if (props.kind === 'chat-add') {
      const rows = await chatApi.listConversations()
      options.value = rows.filter((c) => c.isGroup).map((c) => ({ value: c.id, label: c.title }))
    } else {
      options.value = []
    }
  } catch (error) {
    options.value = []
    loadError.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    choice.value = ''
    text.value = ''
    errorMessage.value = ''
    if (!isText.value) loadOptions()
  }
)

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  const userIds = props.users.map((u) => u.id)
  try {
    let summary = ''
    if (props.kind === 'course') {
      // One assignment per person: the endpoint is per user, and the
      // idempotency key makes a retry harmless.
      const results = await Promise.allSettled(userIds.map((userId) => coursesApi.assign(choice.value, { userId })))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      summary = t('users.actions.course.done', { count: ok })
      if (ok < userIds.length) toast.warning(t('users.actions.partial', { count: userIds.length - ok }))
    } else if (props.kind === 'event') {
      const result = await eventsApi.registerMany(choice.value, userIds)
      summary = t('users.actions.event.done', { count: result.registered.length })
      if (result.failed.length) toast.warning(t('users.actions.partial', { count: result.failed.length }))
    } else if (props.kind === 'department') {
      const result = await usersApi.bulkDepartment(userIds, choice.value)
      summary = t('users.actions.department.done', { count: result.updated })
      if (result.failed.length) toast.warning(t('users.actions.partial', { count: result.failed.length }))
    } else if (props.kind === 'chat-create') {
      await chatApi.createGroup({ title: text.value.trim(), memberIds: userIds })
      summary = t('users.actions.chat-create.done')
    } else if (props.kind === 'chat-add') {
      await chatApi.addGroupMembers(choice.value, userIds)
      summary = t('users.actions.chat-add.done', { count: userIds.length })
    }
    if (summary) toast.success(summary)
    emit('update:modelValue', false)
    emit('done')
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="copy.title"
    :description="copy.hint"
    @update:model-value="!submitting && emit('update:modelValue', $event)"
  >
    <form id="user-pick-target-form" class="space-y-4" @submit.prevent="onSubmit">
      <AppInput v-if="isText" v-model="text" :label="copy.choose" required />
      <template v-else>
        <Skeleton v-if="loading" class="h-10.5 w-full" />
        <p v-else-if="loadError" class="text-small text-danger">{{ loadError }}</p>
        <EmptyState v-else-if="!options.length" icon="layers" :title="copy.empty" />
        <AppSelect v-else v-model="choice" :label="copy.choose" :placeholder="t('common.select')" :options="options" />
      </template>

      <SelectedUsersPreview :users="users" :label="t('users.bulk.selectedEmployees', { count: users.length })" />

      <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
    </form>

    <template #footer>
      <AppButton variant="ghost" :disabled="submitting" @click="emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </AppButton>
      <AppButton type="submit" form="user-pick-target-form" :loading="submitting" :disabled="!canSubmit">
        {{ copy.submit }}
      </AppButton>
    </template>
  </Modal>
</template>
