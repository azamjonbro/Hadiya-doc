<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { orgApi } from '@/services/org'
import { chatApi } from '@/services/chat'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'
import SearchField from '@/components/portal/SearchField.vue'

/**
 * The company's people (reference §8): four segments over one directory.
 * "Xodimlar" and "Yangi xodimlar" are the same card grid with a filter;
 * "Ro'yxat" is the table; "Orgstruktura" is the head-count tree, and a
 * department in it opens the grid narrowed to it. Every segment reads
 * `/org/directory` or `/org/structure`, which show any employee what the
 * chat directory already does — no admin permission involved.
 */
const TABS = ['people', 'new', 'structure', 'list']
const PAGE_SIZE = 24

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const tab = ref(TABS.includes(route.query.tab) ? route.query.tab : 'people')
const search = ref(route.query.q ?? '')
const department = ref(route.query.department ?? '')
const page = ref(1)
const data = ref(null)
const structure = ref(null)
const error = ref('')

// The tab, the search and the department live in the URL so a link to
// "IT department, list view" is a link.
watch([tab, search, department], () => {
  page.value = 1
  const query = { tab: tab.value }
  if (search.value) query.q = search.value
  if (department.value) query.department = department.value
  router.replace({ query })
})

const tabs = computed(() =>
  TABS.map((value) => ({ value, label: t(`portal.employees.tabs.${value}`) })),
)

let requestSeq = 0
async function loadPeople() {
  const seq = ++requestSeq
  data.value = null
  error.value = ''
  try {
    const result = await orgApi.directory({
      search: search.value,
      department: department.value,
      newOnly: tab.value === 'new',
      page: page.value,
      limit: PAGE_SIZE,
    })
    if (seq === requestSeq) data.value = result
  } catch (e) {
    if (seq === requestSeq) error.value = apiErrorText(e, t('portal.employees.loadError'))
  }
}

async function loadStructure() {
  if (structure.value) return
  try {
    structure.value = await orgApi.structure()
  } catch (e) {
    toast.error(apiErrorText(e))
  }
}

let debounce
watch([tab, search, department, page], () => {
  if (tab.value === 'structure') return
  clearTimeout(debounce)
  debounce = setTimeout(loadPeople, search.value ? 250 : 0)
})
onMounted(() => {
  loadStructure()
  if (tab.value !== 'structure') loadPeople()
})

const total = computed(() => structure.value?.total ?? 0)
const departments = computed(() => {
  const names = new Set()
  for (const branch of structure.value?.branches ?? []) {
    for (const d of branch.departments) if (d.name) names.add(d.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
})

function openDepartment(name) {
  department.value = name
  tab.value = 'people'
}

// A card colour per person: stable for the name, so the same colleague
// looks the same on every visit, and varied across the grid.
const GRADIENTS = [
  'from-emerald-600 to-teal-800',
  'from-sky-600 to-indigo-800',
  'from-amber-500 to-orange-700',
  'from-rose-500 to-pink-800',
  'from-violet-600 to-purple-900',
  'from-cyan-600 to-blue-800',
]
function gradientFor(name) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

const DOT_COLOURS = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-cyan-500']
function dotFor(name) {
  return DOT_COLOURS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % DOT_COLOURS.length]
}

function birthday(row) {
  if (!row.birthMonth) return '—'
  return new Date(2000, row.birthMonth - 1, row.birthDay).toLocaleDateString(locale.value, { day: 'numeric', month: 'long' })
}

const contacting = ref('')
async function message(person) {
  if (contacting.value) return
  contacting.value = person.id
  try {
    const conversation = await chatApi.openDirect(person.id)
    router.push({ path: '/chat', query: { c: conversation.id } })
  } catch (e) {
    toast.error(apiErrorText(e))
  } finally {
    contacting.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen bg-surface-2 pb-16">
    <div class="mx-auto w-full max-w-[1140px] px-4 pt-8">
      <!-- The segment, centred like the reference -->
      <div class="flex justify-center">
        <div class="flex rounded-lg bg-surface p-0.5 shadow-sm">
          <button
            v-for="item in tabs"
            :key="item.value"
            type="button"
            class="h-9 rounded-md px-4 text-[13px] transition-default"
            :class="tab === item.value ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:text-ink'"
            @click="tab = item.value"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <!-- ===== Structure ===== -->
      <template v-if="tab === 'structure'">
        <div v-if="!structure" class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton v-for="n in 4" :key="n" class="h-[110px] rounded-lg" />
        </div>
        <div v-else class="mt-8">
          <div class="mx-auto w-[220px] rounded-lg bg-surface p-4 text-center shadow-sm">
            <p class="text-[16px] font-semibold text-ink">{{ t('portal.brand') }}</p>
            <p class="mt-1 text-[13px] text-ink-muted">{{ t('portal.employees.count', { count: structure.total }) }}</p>
          </div>
          <div class="mx-auto h-6 w-px bg-border" aria-hidden="true"></div>
          <div class="space-y-8">
            <section v-for="branch in structure.branches" :key="branch.name || '—'">
              <div class="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink">
                <Icon name="map-pin" size="14" class="mr-1.5 inline text-ink-faint" />{{ branch.name || t('portal.employees.noBranch') }}
                <span class="ml-2 text-ink-muted">{{ branch.count }}</span>
              </div>
              <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  v-for="dept in branch.departments"
                  :key="dept.name || '—'"
                  type="button"
                  class="overflow-hidden rounded-lg bg-surface text-left shadow-sm transition-default hover:shadow-md"
                  @click="openDepartment(dept.name)"
                >
                  <div class="h-2 bg-gradient-to-r" :class="gradientFor(dept.name || 'x')"></div>
                  <div class="px-4 py-3">
                    <p class="truncate text-[14px] font-semibold text-ink">{{ dept.name || t('portal.employees.unassigned') }}</p>
                    <p class="mt-2 flex items-center gap-1.5 text-[13px] text-ink-muted"><Icon name="users" size="14" />{{ dept.count }}</p>
                    <ul v-if="dept.subdivisions.length" class="mt-2 space-y-0.5 border-t border-border pt-2 text-[12px] text-ink-muted">
                      <li v-for="sub in dept.subdivisions" :key="sub.name" class="flex justify-between"><span class="truncate">{{ sub.name }}</span><span>{{ sub.count }}</span></li>
                    </ul>
                  </div>
                </button>
              </div>
            </section>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="mt-8 flex flex-col gap-6 lg:flex-row">
          <!-- Company card + department list, left -->
          <aside v-if="tab !== 'list'" class="w-full shrink-0 lg:w-[260px]">
            <div class="rounded-lg bg-surface p-5 shadow-sm">
              <span class="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-white"><Icon name="building" size="20" /></span>
              <p class="mt-3 text-[20px] font-semibold text-ink">{{ t('portal.brand') }}</p>
              <p class="text-[13px] text-ink-muted">{{ t('portal.employees.count', { count: total }) }}</p>
              <button type="button" class="mt-3 text-[13px] text-info hover:underline" @click="tab = 'structure'">{{ t('portal.employees.seeStructure') }}</button>
            </div>
            <div v-if="departments.length" class="mt-4 rounded-lg bg-surface p-2 shadow-sm">
              <button
                type="button"
                class="block w-full rounded-md px-3 py-2 text-left text-[13px] transition-default"
                :class="!department ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:bg-surface-2'"
                @click="department = ''"
              >{{ t('portal.employees.allDepartments') }}</button>
              <button
                v-for="name in departments"
                :key="name"
                type="button"
                class="block w-full truncate rounded-md px-3 py-2 text-left text-[13px] transition-default"
                :class="department === name ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:bg-surface-2'"
                @click="department = name"
              >{{ name }}</button>
            </div>
          </aside>

          <!-- Grid or table, right -->
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-[20px] font-semibold text-ink">
                {{ department || t(`portal.employees.tabs.${tab}`) }}
                <span v-if="data" class="ml-1 text-[14px] font-normal text-ink-muted">{{ data.total }}</span>
              </h2>
              <SearchField v-model="search" width="w-[220px]" />
            </div>

            <div v-if="error" class="mt-6 rounded-lg bg-surface p-6 text-center text-[13px] text-danger shadow-sm">{{ error }}</div>
            <div v-else-if="!data" class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Skeleton v-for="n in 8" :key="n" class="h-[220px] rounded-lg" />
            </div>
            <div v-else-if="!data.items.length" class="mt-4 rounded-lg bg-surface shadow-sm">
              <EmptyState icon="users" :title="t('portal.employees.empty')" />
            </div>

            <!-- Cards -->
            <div v-else-if="tab !== 'list'" class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <button
                v-for="person in data.items"
                :key="person.id"
                type="button"
                class="group relative flex h-[220px] flex-col justify-end overflow-hidden rounded-lg bg-gradient-to-b p-3 text-left text-white shadow-sm transition-default hover:shadow-md"
                :class="gradientFor(person.fullName)"
                :disabled="contacting === person.id"
                :title="t('portal.employees.message')"
                @click="message(person)"
              >
                <span class="absolute left-1/2 top-8 -translate-x-1/2 rounded-full ring-2 ring-white/40">
                  <Avatar :name="person.fullName" :src="person.avatar" size="xl" />
                </span>
                <span v-if="person.isNew" class="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">{{ t('portal.employees.new') }}</span>
                <p class="text-[13px] font-bold uppercase leading-tight drop-shadow">{{ person.fullName }}</p>
                <p class="mt-0.5 truncate text-[11px] text-white/80">{{ person.position || person.department }}</p>
              </button>
            </div>

            <!-- Table -->
            <div v-else class="mt-4 overflow-x-auto rounded-lg bg-surface shadow-sm">
              <table class="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr class="h-10 whitespace-nowrap border-b border-border text-left text-ink-muted">
                    <th class="pl-4 pr-2 font-medium">{{ t('portal.employees.columns.name') }}</th>
                    <th class="px-2 font-medium">{{ t('portal.employees.columns.department') }}</th>
                    <th class="px-2 font-medium">{{ t('portal.employees.columns.position') }}</th>
                    <th class="px-2 font-medium">{{ t('portal.employees.columns.manager') }}</th>
                    <th class="px-2 font-medium">{{ t('portal.employees.columns.phone') }}</th>
                    <th class="px-2 font-medium">{{ t('portal.employees.columns.email') }}</th>
                    <th class="pl-2 pr-4 font-medium">{{ t('portal.employees.columns.birthday') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="person in data.items" :key="person.id" class="h-12 whitespace-nowrap border-b border-border last:border-b-0">
                    <td class="pl-4 pr-2">
                      <button type="button" class="flex items-center gap-2 text-left hover:text-primary" @click="message(person)">
                        <Avatar :name="person.fullName" :src="person.avatar" size="sm" />
                        <span class="font-medium text-ink">{{ person.fullName }}</span>
                        <span v-if="person.isNew" class="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold uppercase text-primary">{{ t('portal.employees.new') }}</span>
                      </button>
                    </td>
                    <td class="px-2 text-ink">
                      <span v-if="person.department" class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" :class="dotFor(person.department)"></span>{{ person.department }}</span>
                      <span v-else class="text-ink-faint">—</span>
                    </td>
                    <td class="px-2 text-ink">{{ person.position || '—' }}</td>
                    <td class="px-2 text-ink">{{ person.managerName || '—' }}</td>
                    <td class="px-2 text-ink">{{ person.phone || '—' }}</td>
                    <td class="px-2 text-ink">{{ person.email || '—' }}</td>
                    <td class="pl-2 pr-4 text-ink">{{ birthday(person) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="data && data.totalPages > 1" class="mt-4 flex justify-end">
              <Pagination :page="page" :total-pages="data.totalPages" @update:page="page = $event" />
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
