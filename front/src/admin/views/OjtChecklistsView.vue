<script setup>
/**
 * The standard somebody is judged against on the shop floor (13.3).
 *
 * Two things this form knows that the server would otherwise have to teach
 * through a rejected save:
 *
 *   - a step that links a competency must also carry a level, so picking a
 *     competency selects the first rung straight away rather than letting
 *     the save come back with OJT_ITEM_LEVEL_MISSING;
 *   - `order` is the row's index, not something a person types. The
 *     observer reads the list top to bottom on a phone, and the only
 *     honest way to say "this comes first" is to put it first.
 *
 * The catalogue is loaded best-effort: reading `/competencies` needs
 * `competency:assess` or `competency:manage`, and an OJT manager does not
 * necessarily hold either. When it is refused the linking controls say so
 * instead of showing an empty dropdown that looks like an empty catalogue.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ojtApi } from '@/services/ojt'
import { competenciesApi } from '@/services/competencies'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SortableList from '@/components/ui/SortableList.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const items = ref([])
const competencies = ref([])
const scales = ref([])
const scaleOptions = computed(() => [{ value: '', label: t('ojt.scales.yesNo') }, ...scales.value.filter((s) => !s.isSystem).map((s) => ({ value: s.id, label: s.name }))])
const catalogueOpen = ref(true)
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const status = ref('')

const modalOpen = ref(false)
const editingId = ref('')
const draft = ref(emptyDraft())

// Draft rows have no server id until they are saved, and SortableList keys
// on something stable — reusing the index would make Vue reuse the wrong
// input after a drag.
let seq = 0
const nextKey = () => `row-${(seq += 1)}`

function emptyDraft() {
  return {
    name: '',
    description: '',
    position: '',
    department: '',
    passThresholdPercent: 80,
    status: 'DRAFT',
    items: [],
  }
}

function emptyItem() {
  return { key: nextKey(), title: '', criteria: '', required: true, weight: 1, competencyId: '', competencyLevel: null, scaleId: '' }
}

const statusOptions = computed(() =>
  ['DRAFT', 'ACTIVE', 'ARCHIVED'].map((value) => ({ value, label: t(`ojt.status.${value}`) }))
)

const competencyOptions = computed(() => [
  { value: '', label: t('ojt.noCompetency') },
  ...competencies.value.map((competency) => ({ value: competency.id, label: `${competency.code} · ${competency.name}` })),
])

const competencyById = computed(() => new Map(competencies.value.map((competency) => [competency.id, competency])))

function levelOptionsFor(item) {
  const competency = competencyById.value.get(item.competencyId)
  return (competency?.levels ?? []).map((level) => ({ value: level.value, label: `${level.value} · ${level.label}` }))
}

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return items.value
  return items.value.filter(
    (item) =>
      item.name.toLowerCase().includes(term) ||
      (item.position ?? '').toLowerCase().includes(term) ||
      (item.department ?? '').toLowerCase().includes(term)
  )
})

const statusVariant = { DRAFT: 'neutral', ACTIVE: 'success', ARCHIVED: 'neutral' }

async function load() {
  loading.value = true
  try {
    items.value = await ojtApi.checklists(status.value ? { status: status.value } : {})
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.loadError')))
  } finally {
    loading.value = false
  }
}

async function loadCompetencies() {
  try {
    competencies.value = await competenciesApi.list({ status: 'ACTIVE' })
    scales.value = await ojtApi.scales().catch(() => [])
  } catch {
    // Refused or unreachable — the checklist is still fully editable, it
    // simply cannot link a step to the matrix from here.
    catalogueOpen.value = false
  }
}

function openNew() {
  editingId.value = ''
  draft.value = emptyDraft()
  draft.value.items = [emptyItem()]
  modalOpen.value = true
}

function openEdit(checklist) {
  editingId.value = checklist.id
  draft.value = {
    name: checklist.name,
    description: checklist.description ?? '',
    position: checklist.position ?? '',
    department: checklist.department ?? '',
    passThresholdPercent: checklist.passThresholdPercent ?? 80,
    status: checklist.status,
    items: checklist.items.map((item) => ({
      key: nextKey(),
      title: item.title,
      criteria: item.criteria ?? '',
      required: item.required !== false,
      weight: item.weight ?? 1,
      competencyId: item.competencyId ?? '',
      competencyLevel: item.competencyLevel ?? null,
      scaleId: item.scaleId ?? '',
    })),
  }
  modalOpen.value = true
}

function onCompetencyChange(item) {
  if (!item.competencyId) {
    item.competencyLevel = null
    return
  }
  // A linked step without a level is refused by the server; the lowest rung
  // is the honest default — "seen doing it under supervision".
  const options = levelOptionsFor(item)
  if (!options.some((option) => option.value === item.competencyLevel)) {
    item.competencyLevel = options[0]?.value ?? null
  }
}

function payloadFrom(value) {
  return {
    name: value.name.trim(),
    description: value.description.trim(),
    position: value.position.trim(),
    department: value.department.trim(),
    passThresholdPercent: Number(value.passThresholdPercent) || 0,
    items: value.items.map((item, index) => ({
      title: item.title.trim(),
      criteria: item.criteria.trim(),
      order: index,
      required: item.required,
      weight: Number(item.weight) || 0,
      competencyId: item.competencyId || null,
      competencyLevel: item.competencyId ? Number(item.competencyLevel) : null,
      scaleId: item.scaleId || null,
    })),
  }
}

async function save() {
  if (!draft.value.name.trim()) {
    toast.error(t('ojt.nameRequired'))
    return
  }
  if (!draft.value.items.length) {
    toast.error(t('ojt.itemsRequired'))
    return
  }
  if (draft.value.items.some((item) => !item.title.trim())) {
    toast.error(t('ojt.itemTitleRequired'))
    return
  }
  if (draft.value.items.some((item) => item.competencyId && item.competencyLevel == null)) {
    toast.error(t('ojt.levelRequired'))
    return
  }

  saving.value = true
  try {
    const payload = payloadFrom(draft.value)
    if (editingId.value) {
      await ojtApi.updateChecklist(editingId.value, { ...payload, status: draft.value.status })
    } else {
      // The status is not sent on create: the server forces DRAFT whatever
      // arrives, and offering a control that is ignored is a lie.
      await ojtApi.createChecklist(payload)
    }
    modalOpen.value = false
    toast.success(t('ojt.checklistSaved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    saving.value = false
  }
}

async function remove(checklist) {
  const ok = await confirm.ask({
    title: t('ojt.deleteChecklistTitle'),
    message: t('ojt.deleteChecklistMessage', { name: checklist.name }),
  })
  if (!ok) return
  try {
    await ojtApi.removeChecklist(checklist.id)
    toast.success(t('ojt.checklistDeleted'))
    await load()
  } catch (error) {
    // The server refuses to delete a checklist sessions were run against and
    // says to archive instead — that sentence is the useful one.
    toast.error(apiErrorText(error, t('ojt.saveError')))
  }
}

onMounted(() => {
  load()
  loadCompetencies()
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('ojt.adminTitle') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('ojt.adminSubtitle') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('ojt.newChecklist') }}</AppButton>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <AppInput
        v-model="search"
        class="w-64"
        icon="search"
        :aria-label="t('ojt.searchChecklists')"
        :placeholder="t('ojt.searchChecklists')"
      />
      <AppSelect
        v-model="status"
        class="w-44"
        :aria-label="t('ojt.statusLabel')"
        :placeholder="t('ojt.allStatuses')"
        :options="statusOptions"
        @update:model-value="load"
      />
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-lg" />
    </div>

    <EmptyState
      v-else-if="!filtered.length"
      class="mt-6"
      icon="check-square"
      :title="t('ojt.emptyChecklists')"
      :description="t('ojt.emptyChecklistsHint')"
    />

    <!-- Rasn 22: a flat table — clipboard icon + name, status chip,
         position/department, items and threshold, edit/delete on hover -->
    <div v-else class="mt-4 overflow-x-auto">
      <table class="w-full min-w-[760px] text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th class="pl-3 pr-2 font-medium text-ink">{{ t('ojt.name') }} <Icon name="chevron-up" size="12" class="inline text-ink-faint" /></th>
            <th class="w-36 px-2 font-medium">{{ t('ojt.statusLabel') }}</th>
            <th class="w-56 px-2 font-medium">{{ t('ojt.position') }}</th>
            <th class="w-40 px-2 font-medium">{{ t('ojt.items') }}</th>
            <th class="w-28 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="checklist in filtered" :key="checklist.id" class="group h-14 border-b border-border transition-default last:border-b-0 hover:bg-surface-2">
            <td class="pl-3 pr-2">
              <button type="button" class="flex items-center gap-3 text-left" @click="openEdit(checklist)">
                <Icon name="check-square" size="18" class="shrink-0 text-ink-muted" />
                <span class="min-w-0">
                  <span class="block truncate text-ink">{{ checklist.name }}</span>
                  <span v-if="checklist.description" class="block truncate text-caption text-ink-muted">{{ checklist.description }}</span>
                </span>
              </button>
            </td>
            <td class="px-2"><Badge :variant="statusVariant[checklist.status]" size="sm">{{ t(`ojt.status.${checklist.status}`) }}</Badge></td>
            <td class="px-2 text-ink-muted">{{ [checklist.position, checklist.department].filter(Boolean).join(' · ') || '—' }}</td>
            <td class="px-2 text-ink-muted">{{ t('ojt.itemsCount', { count: checklist.items.length }) }} · {{ t('ojt.thresholdShort', { percent: checklist.passThresholdPercent }) }}</td>
            <td class="pr-3 text-right">
              <span class="flex items-center justify-end gap-1 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100">
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="openEdit(checklist)"><Icon name="pencil" size="15" /></button>
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-danger" :aria-label="t('common.delete')" @click="remove(checklist)"><Icon name="trash" size="15" /></button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-model="modalOpen" size="lg" :title="editingId ? t('ojt.editChecklist') : t('ojt.newChecklist')">
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <AppInput v-model="draft.name" :label="t('ojt.name')" required />
          <AppInput v-model="draft.position" :label="t('ojt.position')" :hint="t('ojt.positionHint')" />
        </div>

        <AppInput v-model="draft.description" :label="t('ojt.description')" />

        <div class="grid gap-3 sm:grid-cols-3">
          <AppInput v-model="draft.department" :label="t('ojt.department')" />
          <AppInput
            v-model="draft.passThresholdPercent"
            type="number"
            :label="t('ojt.passThreshold')"
            :hint="t('ojt.passThresholdHint')"
          />
          <AppSelect v-if="editingId" v-model="draft.status" :label="t('ojt.statusLabel')" :options="statusOptions" />
        </div>

        <p v-if="!editingId" class="text-caption text-ink-faint">{{ t('ojt.draftHint') }}</p>

        <div class="rounded-lg border border-border p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-small font-medium text-ink">{{ t('ojt.items') }}</p>
              <p class="text-caption text-ink-faint">{{ t('ojt.itemsHint') }}</p>
            </div>
            <AppButton variant="ghost" size="sm" icon="plus" @click="draft.items.push(emptyItem())">
              {{ t('ojt.addItem') }}
            </AppButton>
          </div>

          <p v-if="!draft.items.length" class="mt-2 text-caption text-ink-faint">{{ t('ojt.noItems') }}</p>

          <!-- Dragging is the shortcut; the up/down buttons are the only way
               to reorder from a keyboard, so both stay. -->
          <SortableList v-model="draft.items" class="mt-3" item-key="key" list-class="space-y-2">
            <template #item="{ item, index, dragging, moveUp, moveDown, isFirst, isLast }">
              <div
                class="cursor-grab rounded-lg border border-border p-3 transition-default active:cursor-grabbing"
                :class="dragging ? 'opacity-40' : ''"
              >
                <div class="flex items-start gap-2">
                  <span class="mt-2.5 w-5 shrink-0 text-caption text-ink-faint">{{ index + 1 }}.</span>
                  <div class="min-w-0 flex-1 space-y-2">
                    <AppInput
                      v-model="item.title"
                      :aria-label="t('ojt.itemTitle')"
                      :placeholder="t('ojt.itemTitle')"
                    />
                    <AppInput
                      v-model="item.criteria"
                      :aria-label="t('ojt.itemCriteria')"
                      :placeholder="t('ojt.itemCriteriaHint')"
                    />
                    <div class="flex flex-wrap items-center gap-3">
                      <label class="flex items-center gap-1.5 text-caption text-ink-muted">
                        <input v-model="item.required" type="checkbox" class="h-3.5 w-3.5 rounded border-border-strong" />
                        {{ t('ojt.required') }}
                      </label>
                      <label class="flex items-center gap-1.5 text-caption text-ink-muted">
                        {{ t('ojt.weight') }}
                        <input
                          v-model="item.weight"
                          type="number"
                          min="0"
                          max="100"
                          class="h-8 w-16 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        />
                      </label>
                      <span class="text-caption text-ink-faint">{{ t('ojt.weightHint') }}</span>
                      <label class="flex items-center gap-1.5 text-caption text-ink-muted">
                        {{ t('ojt.scales.scale') }}
                        <select v-model="item.scaleId" class="h-8 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none focus:border-primary">
                          <option v-for="option in scaleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                        </select>
                      </label>
                    </div>

                    <div v-if="catalogueOpen" class="flex flex-wrap items-center gap-2">
                      <AppSelect
                        v-model="item.competencyId"
                        class="min-w-56 flex-1"
                        :aria-label="t('ojt.competency')"
                        :options="competencyOptions"
                        @update:model-value="onCompetencyChange(item)"
                      />
                      <AppSelect
                        v-if="item.competencyId"
                        v-model="item.competencyLevel"
                        class="w-44"
                        :aria-label="t('ojt.competencyLevel')"
                        :options="levelOptionsFor(item)"
                      />
                    </div>
                    <p v-else class="text-caption text-ink-faint">{{ t('ojt.competencyUnavailable') }}</p>
                    <p v-if="catalogueOpen && item.competencyId" class="text-caption text-ink-faint">
                      {{ t('ojt.competencyHint') }}
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-col gap-1">
                    <AppButton
                      variant="ghost"
                      size="sm"
                      icon="chevron-up"
                      :disabled="isFirst"
                      :aria-label="t('common.moveUp')"
                      @click="moveUp()"
                    />
                    <AppButton
                      variant="ghost"
                      size="sm"
                      icon="chevron-down"
                      :disabled="isLast"
                      :aria-label="t('common.moveDown')"
                      @click="moveDown()"
                    />
                    <AppButton
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      :aria-label="t('common.delete')"
                      @click="draft.items.splice(index, 1)"
                    />
                  </div>
                </div>
              </div>
            </template>
          </SortableList>
        </div>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
