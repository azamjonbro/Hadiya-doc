<script setup>
/**
 * Competency profiles (rasm: «Профили компетенций»): named sets of
 * competencies at required levels, tied to job titles. The list is the
 * reference's table — name, description — and the editor asks for the
 * positions, then the competencies one row each with the level required.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ORG_LIST_TYPES } from '@lms/shared'
import { competenciesApi } from '@/services/competencies'
import { useOrgDirectory } from '@/composables/useOrgDirectory'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Modal from '@/components/ui/Modal.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const directory = useOrgDirectory()

const profiles = ref([])
const competencies = ref([])
const loading = ref(true)
const saving = ref(false)
const modalOpen = ref(false)
const editingId = ref('')
const draft = ref(blank())

function blank() {
  return { name: '', description: '', positions: [], items: [] }
}

const columns = computed(() => [
  { key: 'name', label: t('competency.profile.name') },
  { key: 'description', label: t('competency.description') },
  { key: 'positions', label: t('competency.profile.positions'), hidden: true },
  { key: 'itemCount', label: t('competency.profile.items'), width: 'w-40', hidden: true },
])

const positionOptions = computed(() => directory.optionsFor(ORG_LIST_TYPES.POSITION))
const competencyOptions = computed(() => competencies.value.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })))
function levelsOf(competencyId) {
  const c = competencies.value.find((x) => x.id === competencyId)
  return (c?.levels ?? []).map((l) => ({ value: l.value, label: `${l.value} · ${l.label}` }))
}

async function load() {
  loading.value = true
  try {
    ;[profiles.value, competencies.value] = await Promise.all([competenciesApi.profiles(), competenciesApi.list({ status: 'ACTIVE' })])
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.loadError')))
  } finally {
    loading.value = false
  }
}

function openNew() {
  editingId.value = ''
  draft.value = blank()
  modalOpen.value = true
}
function openEdit(profile) {
  editingId.value = profile.id
  draft.value = {
    name: profile.name,
    description: profile.description ?? '',
    positions: [...profile.positions],
    items: profile.items.map((i) => ({ competencyId: i.competencyId, level: i.level })),
  }
  modalOpen.value = true
}
function togglePosition(name) {
  const list = draft.value.positions
  const i = list.indexOf(name)
  i === -1 ? list.push(name) : list.splice(i, 1)
}
function addItem() {
  const used = new Set(draft.value.items.map((i) => i.competencyId))
  const next = competencies.value.find((c) => !used.has(c.id))
  if (!next) return
  draft.value.items.push({ competencyId: next.id, level: next.levels?.[0]?.value ?? 1 })
}
function onItemCompetency(item) {
  const levels = levelsOf(item.competencyId)
  if (!levels.some((l) => l.value === item.level)) item.level = levels[0]?.value ?? 1
}

async function save() {
  const d = draft.value
  if (!d.name.trim()) return toast.error(t('competency.profile.nameRequired'))
  saving.value = true
  try {
    const payload = {
      name: d.name.trim(),
      description: d.description.trim(),
      positions: d.positions,
      items: d.items.map((i) => ({ competencyId: i.competencyId, level: Number(i.level) })),
    }
    if (editingId.value) await competenciesApi.updateProfile(editingId.value, payload)
    else await competenciesApi.createProfile(payload)
    modalOpen.value = false
    toast.success(t('competency.profile.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  } finally {
    saving.value = false
  }
}

async function remove(profile) {
  const ok = await confirm.ask({ title: t('competency.profile.deleteTitle'), message: t('competency.profile.deleteMessage', { name: profile.name }) })
  if (!ok) return
  try {
    await competenciesApi.removeProfile(profile.id)
    toast.success(t('competency.profile.deleted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  }
}

onMounted(() => {
  load()
  directory.loadAll()
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('competency.profiles') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('competency.profilesSubtitle') }}</p>
      </div>
      <AppButton icon="user-plus" @click="openNew">{{ t('competency.profile.new') }}</AppButton>
    </div>

    <DataTable
      settings-key="competency-profiles"
      class="mt-6"
      :columns="columns"
      :rows="profiles"
      :loading="loading"
      clickable-rows
      empty-icon="users"
      :empty-title="t('competency.profile.empty')"
      :empty-description="t('competency.profile.emptyHint')"
      @row-click="openEdit"
    >
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5">
          <Icon name="user-plus" size="18" class="shrink-0 text-ink-faint" />
          <div class="min-w-0">
            <p class="truncate font-medium text-ink">{{ row.name }}</p>
            <p class="truncate text-caption text-ink-faint">{{ t('competency.profile.count', { count: row.itemCount }) }}<template v-if="row.positions.length"> · {{ row.positions.join(', ') }}</template></p>
          </div>
        </div>
      </template>
      <template #cell-description="{ row }">
        <div class="flex items-center justify-between gap-2">
          <span class="truncate text-ink-muted">{{ row.description || '—' }}</span>
          <span class="flex shrink-0 items-center gap-0.5" @click.stop>
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="openEdit(row)"><Icon name="pencil" size="15" /></button>
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-danger" :aria-label="t('common.delete')" @click="remove(row)"><Icon name="trash" size="15" /></button>
          </span>
        </div>
      </template>
      <template #cell-positions="{ row }">{{ row.positions.join(', ') || '—' }}</template>
    </DataTable>

    <Modal v-model="modalOpen" size="lg" :title="editingId ? t('competency.profile.edit') : t('competency.profile.new')">
      <div class="space-y-5">
        <AppInput v-model="draft.name" :label="t('competency.profile.name')" required />
        <AppInput v-model="draft.description" :label="t('competency.profile.description')" />

        <div>
          <p class="text-small font-medium text-ink">{{ t('competency.profile.positions') }}</p>
          <p class="mb-2 text-caption text-ink-faint">{{ t('competency.profile.positionsHint') }}</p>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in positionOptions"
              :key="option.value"
              class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-small transition-default"
              :class="draft.positions.includes(option.value) ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong text-ink-muted hover:bg-surface-2'"
            >
              <input type="checkbox" class="sr-only" :checked="draft.positions.includes(option.value)" @change="togglePosition(option.value)" />
              {{ option.label }}
            </label>
            <span v-if="!positionOptions.length" class="text-caption text-ink-faint">—</span>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <p class="text-small font-medium text-ink">{{ t('competency.profile.items') }}</p>
            <button type="button" class="flex items-center gap-1.5 text-small text-primary hover:underline" @click="addItem"><Icon name="plus" size="14" /> {{ t('competency.profile.addItem') }}</button>
          </div>
          <div class="mt-2 space-y-2">
            <div v-for="(item, index) in draft.items" :key="index" class="grid grid-cols-[minmax(0,1fr)_180px_36px] items-center gap-2">
              <select v-model="item.competencyId" class="h-9 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none focus:border-primary" @change="onItemCompetency(item)">
                <option v-for="option in competencyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-model.number="item.level" class="h-9 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none focus:border-primary" :title="t('competency.profile.requiredLevel')">
                <option v-for="level in levelsOf(item.competencyId)" :key="level.value" :value="level.value">{{ level.label }}</option>
              </select>
              <button type="button" class="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint hover:text-danger" :aria-label="t('common.delete')" @click="draft.items.splice(index, 1)"><Icon name="close" size="14" /></button>
            </div>
            <p v-if="!draft.items.length" class="text-caption text-ink-faint">—</p>
          </div>
        </div>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
