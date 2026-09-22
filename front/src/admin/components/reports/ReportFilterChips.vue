<script setup>
/**
 * The report page's filter row (rasm «Прогресс учащихся»): «Filtr
 * qo'shish» with a menu of what can be added, then a chip per filter —
 * «Kurs: Barchasi ▾», «Davr: oxirgi 90 kun ▾» — each opening a small
 * popover with its control. The course and the period are always there;
 * the rest (role, person, department, branch, group, manager, account
 * status) appear when added and go with their ×.
 *
 * The chips own no state of their own: `modelValue` is the caller's
 * filter object, and a chip that is removed clears its key in it.
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
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import UserPicker from '@/components/ui/UserPicker.vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue'])
const { t, te } = useI18n()

// The lists the selects are filled from, loaded once each and only when
// that chip is first opened — a report page should not pay for the group
// list to show a table.
const lists = reactive({ courses: null, departments: null, branches: null, groups: null })
async function ensure(name) {
  if (lists[name] !== null) return
  try {
    if (name === 'courses') lists.courses = (await coursesApi.list({ limit: 100 })).items.map((c) => ({ value: c.id, label: c.title }))
    if (name === 'departments') lists.departments = (await usersApi.departments()).map((d) => ({ value: d, label: d }))
    if (name === 'branches') lists.branches = (await usersApi.branches()).map((b) => ({ value: b, label: b }))
    if (name === 'groups') lists.groups = (await groupsApi.list({})).map((g) => ({ value: g.id, label: g.name }))
  } catch {
    lists[name] = []
  }
}

const roleOptions = Object.values(ROLES).map((r) => ({ value: r, label: roleLabel(r, { t, te }) }))

// Every filter the row knows, in the order the menu lists them. `keys` is
// what the filter writes into modelValue; `always` chips cannot be removed.
// A `period` filter is a from/to pair: `keys` holds the two.
const DEFS = [
  { id: 'course', icon: 'book-open', keys: ['courseId'], always: true, kind: 'select', list: 'courses' },
  { id: 'period', icon: 'calendar', keys: ['dateFrom', 'dateTo'], always: true, kind: 'period' },
  // The reference's list (rasm «Добавить фильтр»), in its order.
  { id: 'completed', icon: 'calendar', keys: ['completedFrom', 'completedTo'], kind: 'period' },
  { id: 'deadline', icon: 'calendar', keys: ['deadlineFrom', 'deadlineTo'], kind: 'period' },
  { id: 'lastLogin', icon: 'calendar', keys: ['lastLoginFrom', 'lastLoginTo'], kind: 'period' },
  { id: 'created', icon: 'calendar', keys: ['createdFrom', 'createdTo'], kind: 'period' },
  { id: 'department', icon: 'building', keys: ['department'], kind: 'select', list: 'departments' },
  { id: 'branch', icon: 'map-pin', keys: ['branch'], kind: 'select', list: 'branches' },
  { id: 'group', icon: 'users', keys: ['groupId'], kind: 'select', list: 'groups' },
  { id: 'role', icon: 'user', keys: ['role'], kind: 'select', options: roleOptions },
  { id: 'status', icon: 'user', keys: ['status'], kind: 'select', options: [{ value: 'active', label: t('reports.chips.statusActive') }, { value: 'inactive', label: t('reports.chips.statusInactive') }] },
  { id: 'manager', icon: 'user', keys: ['managerId', 'managerLabel'], kind: 'user' },
  { id: 'user', icon: 'user', keys: ['userId', 'userLabel'], kind: 'user' },
]

// Added chips: the always-on ones, plus any whose key already holds a
// value (a filter restored from the URL), plus what the person adds.
const added = ref(new Set(DEFS.filter((d) => d.always || d.keys.some((k) => props.modelValue[k])).map((d) => d.id)))
const shown = computed(() => DEFS.filter((d) => added.value.has(d.id)))
const addable = computed(() => DEFS.filter((d) => !added.value.has(d.id)))

const menuOpen = ref(false)
const openId = ref('')
const root = ref(null)

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
  openId.value = openId.value === def.id ? '' : def.id
}

function optionsOf(def) {
  return def.options ?? lists[def.list] ?? []
}

// «Kurs: Barchasi» / «Davr: 01.09 – 22.09» / «Rol: Xodim»
function valueLabel(def) {
  const v = props.modelValue
  if (def.kind === 'period') {
    const [fromKey, toKey] = def.keys
    if (!v[fromKey] && !v[toKey]) return t('reports.chips.allTime')
    const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '…')
    return `${fmt(v[fromKey])} – ${fmt(v[toKey])}`
  }
  if (def.kind === 'user') return v[def.keys[1]] || t('reports.chips.any')
  const value = v[def.keys[0]]
  if (!value) return t('reports.chips.any')
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

// A chip whose value arrived from outside (a restored filter) shows up.
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
        <div v-if="menuOpen" class="absolute left-0 z-30 mt-2 w-72 rounded-xl bg-surface p-1.5 shadow-xl ring-1 ring-border" role="menu">
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
          <span class="max-w-[220px] truncate font-medium">{{ valueLabel(def) }}</span>
          <Icon name="chevron-down" size="14" :class="isSet(def) ? 'opacity-70' : 'text-ink-muted'" />
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
        <div v-if="openId === def.id" class="absolute left-0 z-30 mt-2 w-80 rounded-xl bg-surface p-4 shadow-xl ring-1 ring-border">
          <template v-if="def.kind === 'select'">
            <AppSelect
              :model-value="modelValue[def.keys[0]]"
              :placeholder="t('reports.chips.any')"
              :options="optionsOf(def)"
              :aria-label="t(`reports.chips.${def.id}`)"
              @update:model-value="set({ [def.keys[0]]: $event }); openId = ''"
            />
          </template>
          <template v-else-if="def.kind === 'user'">
            <UserPicker
              :model-value="modelValue[def.keys[0]]"
              :display-name="modelValue[def.keys[1]]"
              :placeholder="t('reports.filters.userPlaceholder')"
              @select="set({ [def.keys[0]]: $event.id, [def.keys[1]]: $event.fullName }); openId = ''"
              @clear="set({ [def.keys[0]]: '', [def.keys[1]]: '' })"
            />
          </template>
          <template v-else>
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
                @click="set({ [def.keys[0]]: new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), [def.keys[1]]: new Date().toISOString().slice(0, 10) }); openId = ''"
              >
                {{ t('reports.chips.lastDays', { n: days }) }}
              </button>
              <button type="button" class="rounded-full px-3 py-1 text-[13px] text-ink-muted transition-default hover:text-ink" @click="set({ [def.keys[0]]: '', [def.keys[1]]: '' }); openId = ''">
                {{ t('reports.chips.allTime') }}
              </button>
            </div>
          </template>
        </div>
      </Transition>
    </div>
  </div>
</template>
