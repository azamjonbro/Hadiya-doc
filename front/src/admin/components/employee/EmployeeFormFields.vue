<script setup>
/**
 * Every field of an employee record, in one place, because there are two forms
 * that must agree on them: "new user" in the list view and the settings tab on
 * a profile. When they were two copies of the same markup, a field added to one
 * quietly went missing from the other.
 *
 * The parent owns `form` and this mutates it in place — the object is the
 * parent's `reactive`, and threading fifteen fields through v-model would say
 * nothing extra. Password, course assignment and the active switch stay with
 * the parents: those genuinely differ between creating and editing.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { GENDERS, isJshshir, isPassportSeries } from '@lms/shared'
import AppInput from '@/components/ui/AppInput.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import BranchSelect from '@/components/ui/BranchSelect.vue'
import ManagedSelect from '@/components/ui/ManagedSelect.vue'

const props = defineProps({
  form: { type: Object, required: true },
  // The shared useOrgDirectory() instance — shared so a role created here shows
  // up in the filters above the table without a reload.
  directory: { type: Object, required: true },
  branchOptions: { type: Array, default: () => [] },
  canManageRoles: { type: Boolean, default: false },
  canManageLists: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
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
const passportSeriesError = computed(() =>
  props.form.passportSeries && !isPassportSeries(props.form.passportSeries)
    ? t('users.fields.passportSeriesInvalid')
    : ''
)

watch(
  [jshshirError, passportSeriesError],
  ([a, b]) => emit('validity', !a && !b),
  { immediate: true }
)

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

const roleCreate = computed(() => (props.canManageRoles ? props.directory.addRole : null))
const roleRemove = computed(() =>
  props.canManageRoles ? (option) => props.directory.removeRole(option.id) : null
)

function entryCreate(type) {
  return props.canManageLists ? (name) => props.directory.addEntry(type, name) : null
}
function entryRemove(type) {
  return props.canManageLists ? (option) => props.directory.removeEntry(type, option.id) : null
}
</script>

<template>
  <p class="sm:col-span-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
    {{ t('users.sections.personal') }}
  </p>

  <AppInput v-model="form.lastName" required :disabled="disabled" :label="t('users.fields.lastName')" />
  <AppInput v-model="form.firstName" required :disabled="disabled" :label="t('users.fields.firstName')" />

  <AppInput
    v-model="form.jshshir"
    required
    :disabled="disabled"
    :label="t('users.fields.jshshir')"
    :hint="t('users.fields.jshshirHint')"
    :error="jshshirError"
  />
  <AppInput
    v-model="form.passportSeries"
    :disabled="disabled"
    :label="t('users.fields.passportSeries')"
    :hint="t('users.fields.passportSeriesHint')"
    :error="passportSeriesError"
  />

  <AppSelect
    v-model="form.gender"
    :disabled="disabled"
    :label="t('users.fields.gender')"
    :placeholder="t('users.fields.genderUnset')"
    :options="genderOptions"
  />
  <AppDatePicker v-model="form.birthDate" :disabled="disabled" :max="today" :label="t('users.fields.birthDate')" />

  <AppInput v-model="form.email" type="email" :disabled="disabled" :label="t('users.fields.emailOptional')" />
  <AppInput v-model="form.phone" :disabled="disabled" :label="t('users.fields.phone')" />

  <ManagedSelect
    :disabled="disabled"
    v-model="form.country"
    :label="t('users.fields.country')"
    :options="directory.optionsFor(ORG_LIST_TYPES.COUNTRY)"
    :create-entry="entryCreate(ORG_LIST_TYPES.COUNTRY)"
    :remove-entry="entryRemove(ORG_LIST_TYPES.COUNTRY)"
  />
  <AppInput v-model="form.address" :disabled="disabled" :label="t('users.fields.address')" />

  <p class="sm:col-span-2 mt-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
    {{ t('users.sections.employment') }}
  </p>

  <ManagedSelect
    :disabled="disabled"
    v-model="form.roleName"
    :label="t('users.role')"
    :options="directory.roleOptions.value"
    :create-entry="roleCreate"
    :remove-entry="roleRemove"
  />
  <ManagedSelect
    :disabled="disabled"
    v-model="form.position"
    :label="t('users.fields.position')"
    :options="directory.optionsFor(ORG_LIST_TYPES.POSITION)"
    :create-entry="entryCreate(ORG_LIST_TYPES.POSITION)"
    :remove-entry="entryRemove(ORG_LIST_TYPES.POSITION)"
  />

  <BranchSelect
    v-model="form.branch"
    :options="branchOptions"
    allow-create
    :disabled="disabled"
    :label="t('users.fields.branch')"
  />
  <ManagedSelect
    :disabled="disabled"
    v-model="form.department"
    :label="t('users.fields.department')"
    :options="directory.optionsFor(ORG_LIST_TYPES.DEPARTMENT)"
    :create-entry="entryCreate(ORG_LIST_TYPES.DEPARTMENT)"
    :remove-entry="entryRemove(ORG_LIST_TYPES.DEPARTMENT)"
  />

  <ManagedSelect
    :disabled="disabled"
    v-model="form.subdivision"
    :label="t('users.fields.subdivision')"
    :options="directory.optionsFor(ORG_LIST_TYPES.SUBDIVISION)"
    :create-entry="entryCreate(ORG_LIST_TYPES.SUBDIVISION)"
    :remove-entry="entryRemove(ORG_LIST_TYPES.SUBDIVISION)"
  />
  <div class="hidden sm:block" />

  <AppDatePicker v-model="form.hireDate" :disabled="disabled" :label="t('users.fields.hireDate')" />
  <AppDatePicker
    v-model="form.terminationDate"
    :disabled="disabled"
    :min="form.hireDate"
    :label="t('users.fields.terminationDate')"
    :hint="terminationHint"
  />
</template>
