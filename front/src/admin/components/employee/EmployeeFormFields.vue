<script setup>
/**
 * Every field of an employee record, in one place, because there are two forms
 * that must agree on them: "new user" in the list view and the personal-info
 * tab on a profile. When they were two copies of the same markup, a field
 * added to one quietly went missing from the other.
 *
 * The parent owns `form` and this mutates it in place — the object is the
 * parent's `reactive`, and threading twenty fields through v-model would say
 * nothing extra. Password, course assignment and the active switch stay with
 * the parents: those genuinely differ between creating and editing.
 *
 * Laid out as the reference draws it: label on the left, one field per row,
 * the personal block, then the job block (see FieldRow).
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { GENDERS, isJshshir } from '@lms/shared'
import AppInput from '@/components/ui/AppInput.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import BranchSelect from '@/components/ui/BranchSelect.vue'
import ManagedSelect from '@/components/ui/ManagedSelect.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
import FieldRow from './FieldRow.vue'
import RoleChips from './RoleChips.vue'

const props = defineProps({
  form: { type: Object, required: true },
  // The shared useOrgDirectory() instance — shared so a role created here shows
  // up in the filters above the table without a reload.
  directory: { type: Object, required: true },
  branchOptions: { type: Array, default: () => [] },
  canManageRoles: { type: Boolean, default: false },
  canManageLists: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // The person being edited, so they cannot be made their own manager.
  selfId: { type: String, default: '' },
})

const emit = defineEmits(['validity'])
const { t } = useI18n()

const { ORG_LIST_TYPES } = props.directory

// Checked as the admin types, but only once a field is non-empty — a red error
// on a field nobody has filled in yet reads as a failure, not a hint. The same
// rules run again server-side (user.validator.js).
const jshshirError = computed(() =>
  props.form.jshshir && !isJshshir(props.form.jshshir) ? t('users.fields.jshshirInvalid') : ''
)

watch(jshshirError, (error) => emit('validity', !error), { immediate: true })

// Nobody was born tomorrow — and capping it also stops the year grid from
// offering a decade that cannot contain a birthday.
const today = new Date().toISOString().slice(0, 10)

const genderOptions = computed(() => [
  { value: GENDERS.MALE, label: t('users.fields.genderMale') },
  { value: GENDERS.FEMALE, label: t('users.fields.genderFemale') },
])

// A leaving date archives the account, so say so under the field rather than
// letting the switch flip on save with no explanation.
const terminationHint = computed(() =>
  props.form.terminationDate ? t('users.fields.terminationDateArchives') : t('users.fields.terminationDateHint')
)

function entryCreate(type) {
  return props.canManageLists ? (name) => props.directory.addEntry(type, name) : null
}
function entryRemove(type) {
  return props.canManageLists ? (option) => props.directory.removeEntry(type, option.id) : null
}

function onManagerPicked(user) {
  if (user.id === props.selfId) return
  props.form.managerId = user.id
  props.form.managerName = user.fullName
}
function onManagerCleared() {
  props.form.managerId = ''
  props.form.managerName = ''
}
</script>

<template>
  <div class="space-y-4">
    <FieldRow :label="t('users.fields.lastName')" required>
      <AppInput v-model="form.lastName" required :disabled="disabled" :aria-label="t('users.fields.lastName')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.firstName')" required>
      <AppInput v-model="form.firstName" required :disabled="disabled" :aria-label="t('users.fields.firstName')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.patronymic')">
      <AppInput v-model="form.patronymic" :disabled="disabled" :aria-label="t('users.fields.patronymic')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.jshshir')" required>
      <AppInput
        v-model="form.jshshir"
        required
        :disabled="disabled"
        :aria-label="t('users.fields.jshshir')"
        :hint="t('users.fields.jshshirHint')"
        :error="jshshirError"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.emailOptional')">
      <AppInput v-model="form.email" type="email" :disabled="disabled" :aria-label="t('users.fields.emailOptional')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.phone')">
      <AppInput v-model="form.phone" :disabled="disabled" :aria-label="t('users.fields.phone')" :hint="t('users.fields.phoneHint')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.position')">
      <ManagedSelect
        v-model="form.position"
        :disabled="disabled"
        :aria-label="t('users.fields.position')"
        :placeholder="t('common.select')"
        :options="directory.optionsFor(ORG_LIST_TYPES.POSITION)"
        :create-entry="entryCreate(ORG_LIST_TYPES.POSITION)"
        :remove-entry="entryRemove(ORG_LIST_TYPES.POSITION)"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.country')">
      <ManagedSelect
        v-model="form.country"
        :disabled="disabled"
        :aria-label="t('users.fields.country')"
        :placeholder="t('common.select')"
        :options="directory.optionsFor(ORG_LIST_TYPES.COUNTRY)"
        :create-entry="entryCreate(ORG_LIST_TYPES.COUNTRY)"
        :remove-entry="entryRemove(ORG_LIST_TYPES.COUNTRY)"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.birthDate')">
      <AppDatePicker v-model="form.birthDate" :disabled="disabled" :max="today" :aria-label="t('users.fields.birthDate')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.gender')">
      <AppSelect
        v-model="form.gender"
        :disabled="disabled"
        :aria-label="t('users.fields.gender')"
        :placeholder="t('users.fields.genderUnset')"
        :options="genderOptions"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.address')">
      <AppInput v-model="form.address" :disabled="disabled" :aria-label="t('users.fields.address')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.hireDate')">
      <AppDatePicker v-model="form.hireDate" :disabled="disabled" :aria-label="t('users.fields.hireDate')" />
    </FieldRow>
    <FieldRow :label="t('users.fields.terminationDate')">
      <AppDatePicker
        v-model="form.terminationDate"
        :disabled="disabled"
        :min="form.hireDate"
        :aria-label="t('users.fields.terminationDate')"
        :hint="terminationHint"
      />
    </FieldRow>

    <div class="my-2 border-t border-border sm:max-w-[624px]" />

    <FieldRow :label="t('users.fields.branch')">
      <BranchSelect
        v-model="form.branch"
        :options="branchOptions"
        allow-create
        :disabled="disabled"
        :aria-label="t('users.fields.branch')"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.department')" required>
      <ManagedSelect
        v-model="form.department"
        :disabled="disabled"
        :aria-label="t('users.fields.department')"
        :placeholder="t('common.select')"
        :options="directory.optionsFor(ORG_LIST_TYPES.DEPARTMENT)"
        :create-entry="entryCreate(ORG_LIST_TYPES.DEPARTMENT)"
        :remove-entry="entryRemove(ORG_LIST_TYPES.DEPARTMENT)"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.subdivision')">
      <ManagedSelect
        v-model="form.subdivision"
        :disabled="disabled"
        :aria-label="t('users.fields.subdivision')"
        :placeholder="t('common.select')"
        :options="directory.optionsFor(ORG_LIST_TYPES.SUBDIVISION)"
        :create-entry="entryCreate(ORG_LIST_TYPES.SUBDIVISION)"
        :remove-entry="entryRemove(ORG_LIST_TYPES.SUBDIVISION)"
      />
    </FieldRow>
    <FieldRow :label="t('users.fields.manager')">
      <UserPicker
        :model-value="form.managerId"
        :display-name="form.managerName"
        :placeholder="t('users.fields.managerPlaceholder')"
        :disabled="disabled"
        @select="onManagerPicked"
        @clear="onManagerCleared"
      />
      <p class="mt-1.5 text-small text-ink-faint">{{ t('users.fields.managerHint') }}</p>
    </FieldRow>
    <FieldRow :label="t('users.role')" required>
      <RoleChips v-model="form.roleNames" :roles="directory.roles.value" :disabled="disabled" class="sm:pt-1" />
    </FieldRow>
  </div>
</template>
