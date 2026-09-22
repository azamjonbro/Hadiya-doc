<script setup>
/**
 * Every action the reference offers on a person or a selection of them —
 * assign a course, sign up for an event, put in a group, move to a
 * department, message, create / join a group chat, block, dismiss, delete —
 * behind one `open(action)`. The list's selection bar and the ⋯ on a
 * profile both mount this and call it; the modals, confirmations and
 * toasts live here once instead of twice.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import UserPickTargetModal from './UserPickTargetModal.vue'
import BulkGroupMembersModal from './BulkGroupMembersModal.vue'
import BulkMessageModal from './BulkMessageModal.vue'

const props = defineProps({
  users: { type: Array, default: () => [] },
})

const emit = defineEmits(['done'])

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const pickKind = ref('course')
const pickOpen = ref(false)
const groupOpen = ref(false)
const messageOpen = ref(false)
const busy = ref(false)

const ids = computed(() => props.users.map((u) => u.id))
const one = computed(() => (props.users.length === 1 ? props.users[0].fullName : ''))

function finish(result) {
  emit('done', result)
}

async function run(action) {
  const spec = {
    block: {
      title: t('users.bulk.deactivateTitle'),
      message: one.value ? t('confirm.deactivateUser', { name: one.value }) : t('confirm.deactivateUsers', { count: ids.value.length }),
      confirmLabel: t('users.deactivate'),
      call: () => usersApi.bulkDeactivate(ids.value),
      report: (r) => {
        if (r.deactivated > 0) toast.success(t('users.bulkDeactivated', { count: r.deactivated }))
        if (r.skipped?.length) toast.info(t('users.bulk.alreadyInactive', { count: r.skipped.length }))
        if (r.failed?.length) toast.warning(t('users.bulk.deactivateFailed', { count: r.failed.length }))
      },
    },
    dismiss: {
      title: t('users.actions.dismiss.title'),
      message: t('users.actions.dismiss.message', { count: ids.value.length, name: one.value }),
      confirmLabel: t('users.actions.dismiss.submit'),
      call: () => usersApi.bulkDismiss(ids.value),
      report: (r) => {
        if (r.dismissed > 0) toast.success(t('users.actions.dismiss.done', { count: r.dismissed }))
        if (r.skipped?.length) toast.info(t('users.bulk.alreadyInactive', { count: r.skipped.length }))
        if (r.failed?.length) toast.warning(t('users.actions.partial', { count: r.failed.length }))
      },
    },
    delete: {
      title: t('users.actions.delete.title'),
      message: t('users.actions.delete.message', { count: ids.value.length, name: one.value }),
      confirmLabel: t('common.delete'),
      call: () => usersApi.bulkDelete(ids.value),
      report: (r) => {
        if (r.deleted > 0) toast.success(t('users.actions.delete.done', { count: r.deleted }))
        if (r.failed?.length) toast.warning(t('users.actions.partial', { count: r.failed.length }))
      },
    },
  }[action]
  if (!spec) return
  const ok = await confirm.ask({ title: spec.title, message: spec.message, confirmLabel: spec.confirmLabel, danger: true })
  if (!ok) return
  busy.value = true
  try {
    const result = await spec.call()
    spec.report(result)
    finish(result)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    busy.value = false
  }
}

function open(action) {
  if (!ids.value.length) return
  if (['course', 'event', 'department', 'chat-create', 'chat-add'].includes(action)) {
    pickKind.value = action
    pickOpen.value = true
  } else if (action === 'group') {
    groupOpen.value = true
  } else if (action === 'message') {
    messageOpen.value = true
  } else {
    run(action)
  }
}

defineExpose({ open, busy })
</script>

<template>
  <UserPickTargetModal v-model="pickOpen" :kind="pickKind" :users="users" @done="finish" />
  <BulkGroupMembersModal v-model="groupOpen" mode="add" :users="users" @done="finish" />
  <BulkMessageModal v-model="messageOpen" :users="users" @sent="finish" />
</template>
