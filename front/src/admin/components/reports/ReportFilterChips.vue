<script setup>
/**
 * The report page's filter row (rasm «Прогресс учащихся»): «Filtr
 * qo'shish» with a menu of what can be added, then a chip per filter —
 * «Tayinlash turi: Tanlanmagan ▾», «O'quv nomi: Barchasi ▾» — each
 * opening a popover with its control. Four chips are always there (how
 * the person was enrolled, which course, the period, the completion
 * date); the rest of the reference's list — dates on the record, the org
 * fields, and the record's own fields down to address and phone — appear
 * when added and go with their ×.
 *
 * Controls, by kind: `multi` is a tick list with «Hammasini tanlash» and
 * «Qo'llash»; `search` is a searchable list with «Qo'shish»; `period` is
 * from/to with quick ranges; `select`, `text` and `user` are what they
 * say. The chips own no state: `modelValue` is the caller's filter object.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROLES } from '@lms/shared'
import { roleLabel } from '@/utils/roleLabel'
import { coursesApi } from '@/services/courses'
import { usersApi } from '@/services/users'
import { groupsApi } from '@/services/groups'
import Icon from '@/components/ui/Icon.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import UserPicker from '@/components/ui/UserPicker.vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue'])
const { t, te } = useI18n()

// The lists the selects are filled from, loaded once each and only when
// that chip is first opened.
const lists = reactive({ courses: null, departments: null, branches: null, groups: null, positions: null })
async function ensure(name) {
  if (lists[name] !== null) return
  try {
    if (name === 'courses') lists.courses = (await coursesApi.list({ limit: 100 })).items.map((c) => ({ value: c.id, label: c.title }))
    if (name === 'departments') lists.departments = (await usersApi.departments()).map((d) => ({ value: d, label: d }))
    if (name === 'branches') lists.branches = (await usersApi.branches()).map((b) => ({ value: b, label: b }))
    if (name === 'groups') lists.groups = (await groupsApi.list({})).map((g) => ({ value: g.id, label: g.name }))
    if (name === 'positions') lists.positions = (await usersApi.positions()).map((p) => ({ value: p, label: p }))
  } catch {
    lists[name] = []
  }
}

const roleOptions = Object.values(ROLES).map((r) => ({ value: r, label: roleLabel(r, { t, te }) }))
const enrollmentOptions = [
  { value: 'manual', label: t('reports.chips.enrollmentManual') },
  { value: 'self', label: t('reports.chips.enrollmentSelf') },
  { value: 'group', label: t('reports.chips.enrollmentGroup') },
]

// Every filter the row knows, in the reference's order. `keys` is what the
// filter writes into modelValue; `always` chips cannot be removed.
const DEFS = [
  { id: 'enrollment', icon: 'user-plus', keys: ['enrollment'], always: true, kind: 'multi', options: enrollmentOptions },
  { id: 'course', icon: 'book-open', keys: ['courseId'], always: true, kind: 'search', list: 'courses' },
  { id: 'period', icon: 'calendar', keys: ['dateFrom', 'dateTo'], always: true, kind: 'period' },
  { id: 'completed', icon: 'calendar', keys: ['completedFrom', 'completedTo'], always: true, kind: 'period' },
  { id: 'deadline', icon: 'calendar', keys: ['deadlineFrom', 'deadlineTo'], kind: 'period' },
  { id: 'assigned', icon: 'calendar', keys: ['assignedFrom', 'assignedTo'], kind: 'period' },
  { id: 'lastLogin', icon: 'calendar', keys: ['lastLoginFrom', 'lastLoginTo'], kind: 'period' },
  { id: 'created', icon: 'calendar', keys: ['createdFrom', 'createdTo'], kind: 'period' },
  { id: 'department', icon: 'building', keys: ['department'], kind: 'select', list: 'departments' },
  { id: 'branch', icon: 'map-pin', keys: ['branch'], kind: 'select', list: 'branches' },
  { id: 'group', icon: 'users', keys: ['groupId'], kind: 'select', list: 'groups' },
  { id: 'role', icon: 'user', keys: ['role'], kind: 'select', options: roleOptions },
  { id: 'status', icon: 'user', keys: ['status'], kind: 'select', options: [{ value: 'active', label: t('reports.chips.statusActive') }, { value: 'inactive', label: t('reports.chips.statusInactive') }] },
  { id: 'manager', icon: 'user', keys: ['managerId', 'managerLabel'], kind: 'user' },
  { id: 'functionalManager', icon: 'user', keys: ['functionalManagerId', 'functionalManagerLabel'], kind: 'user' },
  { id: 'user', icon: 'user', keys: ['userId', 'userLabel'], kind: 'user' },
  { id: 'firstName', icon: 'user', keys: ['firstName'], kind: 'text' },
  { id: 'lastName', icon: 'user', keys: ['lastName'], kind: 'text' },
  { id: 'jshshir', icon: 'user', keys: ['jshshir'], kind: 'text' },
  { id: 'email', icon: 'send', keys: ['email'], kind: 'text' },
  { id: 'phone', icon: 'user', keys: ['phone'], kind: 'text' },
  { id: 'mobilePhone', icon: 'user', keys: ['mobilePhone'], kind: 'text' },
  { id: 'position', icon: 'briefcase', keys: ['position'], kind: 'select', list: 'positions' },
  { id: 'country', icon: 'globe', keys: ['country'], kind: 'text' },
  { id: 'gender', icon: 'user', keys: ['gender'], kind: 'select', options: [{ value: 'MALE', label: t('users.fields.genderMale') }, { value: 'FEMALE', label: t('users.fields.genderFemale') }] },
  { id: 'address', icon: 'map-pin', keys: ['address'], kind: 'text' },
  { id: 'hire', icon: 'calendar', keys: ['hireFrom', 'hireTo'], kind: 'period' },
  { id: 'termination', icon: 'calendar', keys: ['terminationFrom', 'terminationTo'], kind: 'period' },
]

const added = ref(new Set(DEFS.filter((d) => d.always || d.keys.some((k) => props.modelValue[k])).map((d) => d.id)))
const shown = computed(() => DEFS.filter((d) => added.value.has(d.id)))
const addable = computed(() => DEFS.filter((d) => !added.value.has(d.id)))

const menuOpen = ref(false)
const openId = ref('')
const root = ref(null)

// Working copies for the controls that apply on a button: the ticked
// values of a `multi`, the highlighted row and search of a `search`, the
// typed text of a `text`.
const draft = reactive({ multi: [], pick: '', search: '', text: '' })

function set(patch) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function add(def) {
  added.value = new Set([...added.value, def.id])
  menuOpen.value = false
  open(def)
}
function remove(def) {
  const next = new Set(added.value)
  next.delete(def.id)
  added.value = next
  openId.value = ''
  set(Object.fromEntries(def.keys.map((k) => [k, ''])))
}
function open(def) {
  if (def.list) ensure(def.list)
  if (openId.value === def.id) {
    openId.value = ''
    return
  }
  menuOpen.value = false
  const v = props.modelValue
  draft.multi = def.kind === 'multi' ? String(v[def.keys[0]] ?? '').split(',').filter(Boolean) : []
  draft.pick = def.kind === 'search' ? v[def.keys[0]] ?? '' : ''
  draft.search = ''
  draft.text = def.kind === 'text' ? v[def.keys[0]] ?? '' : ''
  openId.value = def.id
}
function close() {
  openId.value = ''
}

function optionsOf(def) {
  return def.options ?? lists[def.list] ?? []
}
const searchRows = computed(() => {
  const def = DEFS.find((d) => d.id === openId.value)
  if (!def || def.kind !== 'search') return []
  const term = draft.search.trim().toLowerCase()
  const rows = optionsOf(def)
  return term ? rows.filter((o) => o.label.toLowerCase().includes(term)) : rows
})

function toggleMulti(value) {
  draft.multi = draft.multi.includes(value) ? draft.multi.filter((v) => v !== value) : [...draft.multi, value]
}
function applyMulti(def) {
  set({ [def.keys[0]]: draft.multi.join(',') })
  close()
}
function applyPick(def) {
  set({ [def.keys[0]]: draft.pick })
  close()
}
function applyText(def) {
  set({ [def.keys[0]]: draft.text.trim() })
  close()
}

// «Tayinlash turi: Tanlanmagan» / «O'quv nomi: Barchasi» / «Davr: 01.09 – 22.09»
function valueLabel(def) {
  const v = props.modelValue
  if (def.kind === 'period') {
    const [fromKey, toKey] = def.keys
    if (!v[fromKey] && !v[toKey]) return def.always ? t('reports.chips.notChosen') : t('reports.chips.allTime')
    const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '…')
    return `${fmt(v[fromKey])} – ${fmt(v[toKey])}`
  }
  if (def.kind === 'user') return v[def.keys[1]] || t('reports.chips.any')
  if (def.kind === 'multi') {
    const picked = String(v[def.keys[0]] ?? '').split(',').filter(Boolean)
    if (!picked.length) return t('reports.chips.notChosen')
    if (picked.length === def.options.length) return t('reports.chips.any')
    return picked.map((p) => def.options.find((o) => o.value === p)?.label ?? p).join(', ')
  }
  const value = v[def.keys[0]]
  if (!value) return t('reports.chips.any')
  if (def.kind === 'text') return value
  return optionsOf(def).find((o) => o.value === value)?.label ?? value
}
function isSet(def) {
  return def.keys.some((k) => props.modelValue[k])
}

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) {
    menuOpen.value = false
    openId.value = ''
  }
}
document.addEventListener('click', onDocumentClick)
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

watch(
  () => props.modelValue,
  (v) => {
    for (const def of DEFS) if (def.keys.some((k) => v[k]) && !added.value.has(def.id)) added.value = new Set([...added.value, def.id])
  },
)
</script>

<template>
  <div ref="root" class="flex flex-wrap items-center gap-2">
    <!-- «Filtr qo'shish» -->
    <div class="relative">
      <button
        type="button"
        class="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-4 text-[14px] font-medium text-ink transition-default hover:bg-surface-hover"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click="menuOpen = !menuOpen; openId = ''"
      >
        <Icon name="filter" size="16" />{{ t('reports.chips.add') }}
      </button>
      <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1" leave-active-class="transition-default" leave-to-class="opacity-0 -translate-y-1">
        <div v-if="menuOpen" class="absolute left-0 z-30 mt-2 max-h-[60vh] w-80 overflow-y-auto rounded-xl bg-surface p-1.5 shadow-xl ring-1 ring-border" role="menu">
          <button
            v-for="def in addable"
            :key="def.id"
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] text-ink transition-default hover:bg-surface-2"
            @click="add(def)"
          >
            <Icon :name="def.icon" size="16" class="text-ink-muted" />{{ t(`reports.chips.${def.id}`) }}
          </button>
          <p v-if="!addable.length" class="px-3 py-2 text-[13px] text-ink-faint">{{ t('reports.chips.allAdded') }}</p>
        </div>
      </Transition>
    </div>

    <!-- The chips -->
    <div v-for="def in shown" :key="def.id" class="relative">
      <div
        class="flex h-10 items-center rounded-lg text-[14px] transition-default"
        :class="isSet(def) ? 'bg-primary-subtle text-primary' : 'bg-surface-2 text-ink hover:bg-surface-hover'"
      >
        <button type="button" class="flex h-full items-center gap-2 pl-3.5" :class="def.always ? 'pr-3.5' : 'pr-1'" :aria-expanded="openId === def.id" @click="open(def)">
          <Icon :name="def.icon" size="16" :class="isSet(def) ? 'opacity-70' : 'text-ink-muted'" />
          <span :class="isSet(def) ? 'opacity-70' : 'text-ink-muted'">{{ t(`reports.chips.${def.id}`) }}:</span>
          <span class="max-w-[240px] truncate font-medium">{{ valueLabel(def) }}</span>
          <Icon :name="openId === def.id ? 'chevron-up' : 'chevron-down'" size="14" :class="isSet(def) ? 'opacity-70' : 'text-ink-muted'" />
        </button>
        <button
          v-if="!def.always"
          type="button"
          class="flex h-full items-center pl-1 pr-2.5 transition-default hover:text-danger"
          :class="isSet(def) ? 'opacity-70' : 'text-ink-faint'"
          :aria-label="t('reports.chips.remove')"
          @click="remove(def)"
        >
          <Icon name="close" size="14" />
        </button>
      </div>

      <Transition enter-active-class="transition-default" enter-from-class="opacity-0 -translate-y-1" leave-active-class="transition-default" leave-to-class="opacity-0 -translate-y-1">
        <div v-if="openId === def.id" class="absolute left-0 z-30 mt-2 rounded-xl bg-surface shadow-xl ring-1 ring-border" :class="def.kind === 'search' ? 'w-[420px]' : 'w-80'">
          <!-- Tick list + «Hammasini tanlash» / «Qo'llash» (rasm «Тип назначения») -->
          <template v-if="def.kind === 'multi'">
            <ul class="p-2">
              <li v-for="option in def.options" :key="option.value">
                <label class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-ink transition-default hover:bg-surface-2">
                  <input type="checkbox" class="h-4 w-4 rounded border-border-strong accent-primary" :checked="draft.multi.includes(option.value)" @change="toggleMulti(option.value)" />
                  {{ option.label }}
                </label>
              </li>
            </ul>
            <div class="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <button type="button" class="text-[14px] font-medium text-primary hover:underline" @click="draft.multi = draft.multi.length === def.options.length ? [] : def.options.map((o) => o.value)">
                {{ draft.multi.length === def.options.length ? t('reports.chips.clearAll') : t('reports.chips.selectAll') }}
              </button>
              <AppButton size="sm" @click="applyMulti(def)">{{ t('reports.chips.apply') }}</AppButton>
            </div>
          </template>

          <!-- Searchable list + «Qo'shish» (rasm «Название обучения») -->
          <template v-else-if="def.kind === 'search'">
            <div class="border-b border-border p-3">
              <AppInput v-model="draft.search" icon="search" :placeholder="t('common.search')" />
            </div>
            <ul class="max-h-72 overflow-y-auto p-2">
              <li>
                <label class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-ink transition-default hover:bg-surface-2">
                  <input v-model="draft.pick" type="radio" value="" class="h-4 w-4 border-border-strong accent-primary" />
                  {{ t('reports.chips.any') }}
                </label>
              </li>
              <li v-for="option in searchRows" :key="option.value">
                <label class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-ink transition-default hover:bg-surface-2">
                  <input v-model="draft.pick" type="radio" :value="option.value" class="h-4 w-4 border-border-strong accent-primary" />
                  <Icon name="layers" size="15" class="shrink-0 text-ink-muted" />
                  <span class="truncate">{{ option.label }}</span>
                </label>
              </li>
              <li v-if="!searchRows.length" class="px-3 py-4 text-center text-[13px] text-ink-faint">{{ t('reports.preview.empty') }}</li>
            </ul>
            <div class="flex justify-end border-t border-border px-4 py-3">
              <AppButton size="sm" @click="applyPick(def)">{{ t('reports.chips.addPick') }}</AppButton>
            </div>
          </template>

          <template v-else-if="def.kind === 'select'">
            <div class="p-4">
              <AppSelect
                :model-value="modelValue[def.keys[0]]"
                :placeholder="t('reports.chips.any')"
                :options="optionsOf(def)"
                :aria-label="t(`reports.chips.${def.id}`)"
                @update:model-value="set({ [def.keys[0]]: $event }); close()"
              />
            </div>
          </template>

          <template v-else-if="def.kind === 'user'">
            <div class="p-4">
              <UserPicker
                :model-value="modelValue[def.keys[0]]"
                :display-name="modelValue[def.keys[1]]"
                :placeholder="t('reports.filters.userPlaceholder')"
                @select="set({ [def.keys[0]]: $event.id, [def.keys[1]]: $event.fullName }); close()"
                @clear="set({ [def.keys[0]]: '', [def.keys[1]]: '' })"
              />
            </div>
          </template>

          <template v-else-if="def.kind === 'text'">
            <div class="p-4">
              <AppInput v-model="draft.text" :placeholder="t('reports.chips.contains')" @keyup.enter="applyText(def)" />
              <div class="mt-3 flex justify-end">
                <AppButton size="sm" @click="applyText(def)">{{ t('reports.chips.apply') }}</AppButton>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="p-4">
              <div class="grid grid-cols-2 gap-3">
                <AppDatePicker :model-value="modelValue[def.keys[0]]" :label="t('reports.filters.dateFrom')" :placeholder="t('reports.filters.datePlaceholder')" @update:model-value="set({ [def.keys[0]]: $event })" />
                <AppDatePicker :model-value="modelValue[def.keys[1]]" :label="t('reports.filters.dateTo')" :placeholder="t('reports.filters.datePlaceholder')" @update:model-value="set({ [def.keys[1]]: $event })" />
              </div>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <button
                  v-for="days in [7, 30, 90]"
                  :key="days"
                  type="button"
                  class="rounded-full bg-surface-2 px-3 py-1 text-[13px] text-ink transition-default hover:bg-surface-hover"
                  @click="set({ [def.keys[0]]: new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), [def.keys[1]]: new Date().toISOString().slice(0, 10) }); close()"
                >
                  {{ t('reports.chips.lastDays', { n: days }) }}
                </button>
                <button type="button" class="rounded-full px-3 py-1 text-[13px] text-ink-muted transition-default hover:text-ink" @click="set({ [def.keys[0]]: '', [def.keys[1]]: '' }); close()">
                  {{ t('reports.chips.allTime') }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>
