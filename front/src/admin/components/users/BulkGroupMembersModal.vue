<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupsApi } from '@/services/groups'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SelectedUsersPreview from './SelectedUsersPreview.vue'

// Moving a whole selection into or out of an existing org group. One
// component for both directions: they ask the same question ("which group?"),
// show the same roster and differ only in the verb and the colour of the
// button — two files would be the same file twice.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'add' }, // add | remove
  users: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'done'])

const { t } = useI18n()
const toast = useToast()

const groups = ref([])
const loadingGroups = ref(false)
const groupsError = ref('')
const groupId = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const isRemove = computed(() => props.mode === 'remove')
const groupOptions = computed(() =>
  groups.value.map((group) => ({
    value: group.id,
    label: t('users.bulk.groupOption', { name: group.name, count: group.memberCount }),
  }))
)
const canSubmit = computed(() => Boolean(groupId.value) && props.users.length > 0)

// Loaded when the modal opens rather than on mount: the list has to reflect
// groups created since the page was drawn — including one created a moment
// ago from this very toolbar.
async function loadGroups() {
  loadingGroups.value = true
  groupsError.value = ''
  try {
    groups.value = await groupsApi.list({})
  } catch (error) {
    groups.value = []
    groupsError.value = apiErrorText(error)
  } finally {
    loadingGroups.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    groupId.value = ''
    errorMessage.value = ''
    loadGroups()
  }
)

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  errorMessage.value = ''
  const userIds = props.users.map((user) => user.id)
  try {
    const result = isRemove.value
      ? await groupsApi.bulkRemoveMembers(groupId.value, userIds)
      : await groupsApi.bulkAddMembers(groupId.value, userIds)

    const groupName = result.group?.name ?? ''

    if (isRemove.value) {
      if (result.removed > 0) toast.success(t('users.bulk.removedFromGroup', { count: result.removed, name: groupName }))
      // "Nobody was in it" is an answer, not a silent no-op.
      if (result.notMemberIds?.length) {
        toast.warning(t('users.bulk.notInGroup', { count: result.notMemberIds.length }))
      }
    } else {
      if (result.added > 0) toast.success(t('users.bulk.addedToGroup', { count: result.added, name: groupName }))
      if (result.alreadyMemberIds?.length) {
        toast.warning(t('users.bulk.alreadyInGroup', { count: result.alreadyMemberIds.length }))
      }
      if (result.notFoundIds?.length) {
        toast.warning(t('users.bulk.groupMembersMissing', { count: result.notFoundIds.length }))
      }
    }

    emit('update:modelValue', false)
    emit('done', result)
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
    :title="isRemove ? t('users.bulk.groupRemoveTitle') : t('users.bulk.groupAddTitle')"
    :description="isRemove ? t('users.bulk.groupRemoveHint') : t('users.bulk.groupAddHint')"
    @update:model-value="!submitting && emit('update:modelValue', $event)"
  >
    <form id="bulk-group-members-form" class="space-y-4" @submit.prevent="onSubmit">
      <Skeleton v-if="loadingGroups" class="h-10.5 w-full" />
      <p v-else-if="groupsError" class="text-small text-danger">{{ groupsError }}</p>
      <EmptyState
        v-else-if="!groups.length"
        icon="users"
        :title="t('groups.empty')"
        :description="t('groups.emptyHint')"
      />
      <AppSelect
        v-else
        v-model="groupId"
        :label="t('users.bulk.chooseGroup')"
        :placeholder="t('users.bulk.chooseGroupPlaceholder')"
        :options="groupOptions"
      />

      <SelectedUsersPreview :users="users" :label="t('users.bulk.selectedEmployees', { count: users.length })" />

      <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
    </form>

    <template #footer>
      <AppButton variant="ghost" :disabled="submitting" @click="emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </AppButton>
      <AppButton
        type="submit"
        form="bulk-group-members-form"
        :variant="isRemove ? 'danger' : 'primary'"
        :loading="submitting"
        :disabled="!canSubmit"
      >
        {{ isRemove ? t('users.bulk.remove') : t('users.bulk.add') }}
      </AppButton>
    </template>
  </Modal>
</template>
