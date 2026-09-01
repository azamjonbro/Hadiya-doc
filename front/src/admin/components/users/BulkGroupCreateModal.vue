<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupsApi } from '@/services/groups'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import SelectedUsersPreview from './SelectedUsersPreview.vue'

// A new *org* group (the Guruhlar section), not a chat room — created through
// the same POST /groups the groups page uses, which already accepts its roster
// at creation time. The selected employees go in as members in that one call,
// so there is no window where the group exists with nobody in it.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  users: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'created'])

const { t } = useI18n()
const toast = useToast()

const BLANK = { name: '', description: '', department: '' }
const form = reactive({ ...BLANK })
const submitting = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => form.name.trim().length > 0 && props.users.length > 0)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    Object.assign(form, BLANK)
    errorMessage.value = ''
  }
)

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  errorMessage.value = ''
  try {
    const group = await groupsApi.create({
      name: form.name.trim(),
      description: form.description.trim(),
      department: form.department.trim(),
      memberIds: props.users.map((user) => user.id),
    })

    toast.success(t('users.bulk.groupCreated', { name: group.name, count: group.memberCount }))
    // The server drops ids that no longer resolve rather than failing the
    // whole call, so a roster smaller than the selection is worth saying out
    // loud instead of leaving the admin to count.
    const missing = props.users.length - group.memberCount
    if (missing > 0) toast.warning(t('users.bulk.groupMembersMissing', { count: missing }))

    emit('update:modelValue', false)
    emit('created', group)
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
    :title="t('users.bulk.groupCreateTitle')"
    :description="t('users.bulk.groupCreateHint')"
    @update:model-value="!submitting && emit('update:modelValue', $event)"
  >
    <form id="bulk-group-create-form" class="space-y-4" @submit.prevent="onSubmit">
      <AppInput v-model="form.name" :label="t('groups.fields.name')" required :disabled="submitting" />
      <AppInput v-model="form.description" :label="t('groups.fields.description')" :disabled="submitting" />
      <AppInput
        v-model="form.department"
        :label="t('groups.fields.department')"
        :hint="t('groups.fields.departmentHint')"
        :disabled="submitting"
      />

      <SelectedUsersPreview :users="users" :label="t('users.bulk.members', { count: users.length })" />

      <p v-if="errorMessage" class="text-small text-danger">{{ errorMessage }}</p>
    </form>

    <template #footer>
      <AppButton variant="ghost" :disabled="submitting" @click="emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </AppButton>
      <AppButton type="submit" form="bulk-group-create-form" :loading="submitting" :disabled="!canSubmit">
        {{ t('groups.create') }}
      </AppButton>
    </template>
  </Modal>
</template>
