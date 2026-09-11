<script setup>
/**
 * Who is up to date on what.
 *
 * A matrix rather than a list because the question is comparative — "which
 * of my people are overdue on fire safety" is answered by scanning a
 * column, and a list of assignments makes you count.
 *
 * Every cell carries the date behind its state. A red square that does not
 * say "expired in March" is something nobody can act on.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { complianceApi } from '@/services/compliance'
import { coursesApi } from '@/services/courses'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import Tabs from '@/components/ui/Tabs.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const tab = ref('matrix')
const matrix = ref({ courses: [], rows: [] })
const rules = ref([])
const courses = ref([])
const loading = ref(true)
const search = ref('')

const modalOpen = ref(false)
const saving = ref(false)
const draft = ref({ name: '', courseId: '', intervalMonths: 12, dueDays: 30, departments: '' })

// Complete literal class strings — Tailwind cannot see a class built at
// runtime, so `bg-${state}-subtle` would ship without the rule.
const stateStyle = {
  VALID: { tone: 'bg-success-subtle text-success', icon: 'check' },
  DUE: { tone: 'bg-warning-subtle text-warning', icon: 'clock' },
  EXPIRED: { tone: 'bg-danger-subtle text-danger', icon: 'alert-circle' },
  NEVER: { tone: 'bg-surface-2 text-ink-faint', icon: 'close' },
  NOT_APPLICABLE: { tone: '', icon: '' },
}

const tabs = computed(() => [
  { value: 'matrix', label: t('compliance.tabs.matrix'), count: matrix.value.rows.length },
  { value: 'rules', label: t('compliance.tabs.rules'), count: rules.value.length },
])

const filteredRows = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return matrix.value.rows
  return matrix.value.rows.filter(
    (row) => row.fullName.toLowerCase().includes(term) || row.department.toLowerCase().includes(term)
  )
})

// The number somebody actually reports upward.
const summary = computed(() => {
  const counts = { VALID: 0, DUE: 0, EXPIRED: 0, NEVER: 0 }
  for (const row of matrix.value.rows) {
    for (const cell of row.cells) {
      if (cell.state in counts) counts[cell.state] += 1
    }
  }
  return counts
})

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(locale.value) : '—'
}

function cellTitle(cell) {
  if (cell.state === 'VALID') return t('compliance.validUntil', { date: formatDate(cell.expiresAt) })
  if (cell.state === 'DUE') return t('compliance.dueBy', { date: formatDate(cell.deadline) })
  if (cell.state === 'EXPIRED') return t('compliance.expiredOn', { date: formatDate(cell.expiresAt) })
  if (cell.state === 'NEVER') return t('compliance.neverDone')
  return ''
}

async function load() {
  loading.value = true
  try {
    const [matrixData, ruleData] = await Promise.all([complianceApi.matrix(), complianceApi.rules()])
    matrix.value = matrixData
    rules.value = ruleData
  } catch (error) {
    toast.error(apiErrorText(error, t('compliance.loadError')))
  } finally {
    loading.value = false
  }
}

function openNew() {
  draft.value = { name: '', courseId: courses.value[0]?.id ?? '', intervalMonths: 12, dueDays: 30, departments: '' }
  modalOpen.value = true
}

async function save() {
  if (!draft.value.name.trim() || !draft.value.courseId) {
    toast.error(t('compliance.requiredFields'))
    return
  }
  saving.value = true
  try {
    await complianceApi.create({
      name: draft.value.name.trim(),
      courseId: draft.value.courseId,
      intervalMonths: Number(draft.value.intervalMonths) || 12,
      dueDays: Number(draft.value.dueDays) || 30,
      match: {
        departments: draft.value.departments
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      },
    })
    // Created inactive by the server, deliberately — so the toast says so
    // rather than letting somebody assume it is already running.
    toast.success(t('compliance.createdInactive'))
    modalOpen.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('compliance.saveError')))
  } finally {
    saving.value = false
  }
}

async function toggle(rule) {
  if (!rule.active) {
    const ok = await confirm({
      title: t('compliance.activateTitle'),
      message: t('compliance.activateMessage', { name: rule.name }),
      danger: false,
    })
    if (!ok) return
  }
  try {
    await complianceApi.update(rule.id, { active: !rule.active })
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('compliance.saveError')))
  }
}

async function run(rule) {
  try {
    const result = await complianceApi.run(rule.id)
    toast.success(t('compliance.applied', { count: result.reassigned }))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('compliance.saveError')))
  }
}

async function remove(rule) {
  const ok = await confirm({ title: t('compliance.deleteTitle'), message: t('compliance.deleteMessage') })
  if (!ok) return
  try {
    await complianceApi.remove(rule.id)
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('compliance.saveError')))
  }
}

onMounted(async () => {
  await load()
  coursesApi
    .list({ limit: 100, status: 'PUBLISHED' })
    .then((result) => {
      courses.value = result.items
    })
    .catch(() => {
      courses.value = []
    })
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[28px] font-bold text-ink">{{ t('compliance.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('compliance.subtitle') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('compliance.newRule') }}</AppButton>
    </div>

    <Tabs :model-value="tab" :tabs="tabs" class="mt-6" @update:model-value="(value) => (tab = value)" />

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 5" :key="n" class="h-12 w-full rounded-lg" />
    </div>

    <!-- The matrix -->
    <template v-else-if="tab === 'matrix'">
      <div v-if="!matrix.courses.length" class="mt-6">
        <EmptyState
          icon="shield"
          :title="t('compliance.noRules')"
          :description="t('compliance.noRulesHint')"
        />
      </div>
      <template v-else>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <AppInput v-model="search" class="w-64" icon="search" :placeholder="t('compliance.searchPlaceholder')" />
          <div class="flex flex-wrap gap-2">
            <Badge variant="success" size="sm">{{ t('compliance.state.VALID') }}: {{ summary.VALID }}</Badge>
            <Badge variant="warning" size="sm">{{ t('compliance.state.DUE') }}: {{ summary.DUE }}</Badge>
            <Badge variant="danger" size="sm">{{ t('compliance.state.EXPIRED') }}: {{ summary.EXPIRED }}</Badge>
            <Badge variant="neutral" size="sm">{{ t('compliance.state.NEVER') }}: {{ summary.NEVER }}</Badge>
          </div>
        </div>

        <AppCard class="mt-4 overflow-x-auto p-0">
          <table class="w-full text-small">
            <thead class="border-b border-border text-left text-ink-muted">
              <tr>
                <th class="sticky left-0 bg-surface px-4 py-3 font-medium">{{ t('compliance.person') }}</th>
                <th v-for="column in matrix.courses" :key="column.ruleId" class="px-3 py-3 font-medium">
                  <span class="block max-w-[10rem] truncate">{{ column.title }}</span>
                  <span class="text-caption font-normal text-ink-faint">
                    {{ t('compliance.everyMonths', { months: column.intervalMonths }) }}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.userId" class="border-b border-border last:border-0">
                <td class="sticky left-0 bg-surface px-4 py-2.5">
                  <span class="block truncate text-ink">{{ row.fullName }}</span>
                  <span class="block text-caption text-ink-faint">{{ row.department || '—' }}</span>
                </td>
                <td v-for="cell in row.cells" :key="cell.ruleId" class="px-3 py-2.5">
                  <span
                    v-if="cell.state !== 'NOT_APPLICABLE'"
                    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption"
                    :class="stateStyle[cell.state].tone"
                    :title="cellTitle(cell)"
                  >
                    <Icon :name="stateStyle[cell.state].icon" size="11" />
                    {{ t(`compliance.state.${cell.state}`) }}
                  </span>
                  <!-- Not "compliant": the rule does not apply to them, and
                       painting that green would overstate coverage. -->
                  <span v-else class="text-caption text-ink-faint">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </AppCard>
      </template>
    </template>

    <!-- The rules -->
    <div v-else class="mt-6 space-y-3">
      <EmptyState
        v-if="!rules.length"
        icon="shield"
        :title="t('compliance.noRules')"
        :description="t('compliance.noRulesHint')"
      />
      <AppCard v-for="rule in rules" :key="rule.id" class="flex flex-wrap items-center justify-between gap-4 p-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate font-medium text-ink">{{ rule.name }}</p>
            <Badge :variant="rule.active ? 'success' : 'neutral'" size="sm">
              {{ rule.active ? t('compliance.active') : t('compliance.inactive') }}
            </Badge>
          </div>
          <p class="mt-0.5 text-small text-ink-muted">
            {{ rule.courseTitle }} · {{ t('compliance.everyMonths', { months: rule.intervalMonths }) }} ·
            {{ t('compliance.dueDays', { days: rule.dueDays }) }}
            <template v-if="rule.match?.departments?.length"> · {{ rule.match.departments.join(', ') }}</template>
          </p>
          <p v-if="rule.lastRunAt" class="text-caption text-ink-faint">
            {{ t('compliance.lastRun', { date: formatDate(rule.lastRunAt) }) }}
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <AppButton variant="secondary" size="sm" @click="toggle(rule)">
            {{ rule.active ? t('compliance.pause') : t('compliance.activate') }}
          </AppButton>
          <AppButton v-if="rule.active" variant="ghost" size="sm" icon="refresh" @click="run(rule)" />
          <AppButton variant="ghost" size="sm" icon="trash" @click="remove(rule)" />
        </div>
      </AppCard>
    </div>

    <Modal v-model="modalOpen" :title="t('compliance.newRule')">
      <div class="space-y-3">
        <AppInput v-model="draft.name" :label="t('compliance.ruleName')" required />
        <AppSelect
          v-model="draft.courseId"
          :label="t('compliance.course')"
          :options="courses.map((course) => ({ value: course.id, label: course.title }))"
        />
        <div class="grid grid-cols-2 gap-3">
          <AppInput
            v-model="draft.intervalMonths"
            type="number"
            :label="t('compliance.intervalMonths')"
            :hint="t('compliance.intervalHint')"
          />
          <AppInput
            v-model="draft.dueDays"
            type="number"
            :label="t('compliance.dueDaysLabel')"
            :hint="t('compliance.dueDaysHint')"
          />
        </div>
        <AppInput
          v-model="draft.departments"
          :label="t('compliance.departments')"
          :hint="t('compliance.departmentsHint')"
        />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
