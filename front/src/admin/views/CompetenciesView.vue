<script setup>
/**
 * The catalogue — what the company says its people must be able to do.
 *
 * Two things on this screen are not free-form and the form enforces both,
 * because the server refuses them and a round trip is a worse way to learn
 * it: the level scale is renumbered 1..n as rows are added and removed (the
 * gap arithmetic downstream is subtraction on that number), and a
 * requirement cannot ask for a rung the ladder does not have.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { competenciesApi } from '@/services/competencies'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Badge from '@/components/ui/Badge.vue'
import Modal from '@/components/ui/Modal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const items = ref([])
const folders = ref([])
const openFolders = ref(new Set())
const folderModalOpen = ref(false)
const folderDraft = ref({ id: '', name: '', description: '' })
const menuFor = ref('')
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const category = ref('')
const status = ref('ACTIVE')

const modalOpen = ref(false)
const editingId = ref('')
const draft = ref(emptyDraft())

const SCOPES = ['POSITION', 'DEPARTMENT', 'BRANCH']

function emptyDraft() {
  return {
    code: '',
    name: '',
    description: '',
    category: '',
    validityDays: 0,
    status: 'ACTIVE',
    order: 0,
    levels: [{ label: '' }],
    requirements: [],
  }
}

const categories = computed(() => [...new Set([...folders.value.map((f) => f.name), ...items.value.map((item) => item.category).filter(Boolean)])].sort())

// The tree (rasm): folders first, each with its competencies, then the
// competencies filed under nothing. Searching flattens it — a match inside
// a closed folder is still a match — so folders open while a term is typed.
const tree = computed(() => {
  const rows = filtered.value
  const byFolder = new Map()
  for (const item of rows) {
    const key = item.category || ''
    if (!byFolder.has(key)) byFolder.set(key, [])
    byFolder.get(key).push(item)
  }
  const named = folders.value.map((folder) => ({ ...folder, items: byFolder.get(folder.name) ?? [] }))
  const known = new Set(folders.value.map((f) => f.name))
  const implied = [...byFolder.keys()].filter((k) => k && !known.has(k)).map((name) => ({ id: name, name, description: '', items: byFolder.get(name) }))
  return { folders: [...named, ...implied], loose: byFolder.get('') ?? [] }
})
const searching = computed(() => search.value.trim().length > 0 || Boolean(category.value))
function isOpen(folder) {
  return searching.value || openFolders.value.has(folder.name)
}
function toggleFolder(folder) {
  const next = new Set(openFolders.value)
  next.has(folder.name) ? next.delete(folder.name) : next.add(folder.name)
  openFolders.value = next
}

async function loadFolders() {
  try {
    folders.value = await competenciesApi.folders()
  } catch {
    folders.value = []
  }
}
function openNewFolder() {
  folderDraft.value = { id: '', name: '', description: '' }
  folderModalOpen.value = true
}
function openEditFolder(folder) {
  folderDraft.value = { id: folder.id, name: folder.name, description: folder.description ?? '' }
  folderModalOpen.value = true
  menuFor.value = ''
}
async function saveFolder() {
  const d = folderDraft.value
  if (!d.name.trim()) return toast.error(t('competency.folders.nameRequired'))
  saving.value = true
  try {
    const payload = { name: d.name.trim(), description: d.description.trim() }
    // A folder implied by an old category (id === its name) is created for real on first save.
    if (d.id && folders.value.some((f) => f.id === d.id && f.id !== f.name)) await competenciesApi.updateFolder(d.id, payload)
    else await competenciesApi.createFolder(payload)
    folderModalOpen.value = false
    toast.success(t('competency.folders.saved'))
    await Promise.all([loadFolders(), load()])
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  } finally {
    saving.value = false
  }
}
async function removeFolder(folder) {
  menuFor.value = ''
  const ok = await confirm.ask({ title: t('competency.folders.deleteTitle'), message: t('competency.folders.deleteMessage', { name: folder.name }) })
  if (!ok) return
  try {
    if (folder.id !== folder.name) await competenciesApi.removeFolder(folder.id)
    toast.success(t('competency.folders.deleted'))
    await Promise.all([loadFolders(), load()])
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  }
}
// "Move to folder": the ⋯ on a competency offers the folders; picking one
// re-files it in one request.
async function moveTo(item, folderName) {
  menuFor.value = ''
  try {
    await competenciesApi.update(item.id, { category: folderName })
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  }
}
function openNewIn(folder) {
  openNew()
  draft.value.category = folder.name
}

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return items.value.filter((item) => {
    if (category.value && item.category !== category.value) return false
    if (!term) return true
    return item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)
  })
})

const statusOptions = computed(() => [
  { value: 'ACTIVE', label: t('competency.status.ACTIVE') },
  { value: 'ARCHIVED', label: t('competency.status.ARCHIVED') },
])

const scopeOptions = computed(() => SCOPES.map((scope) => ({ value: scope, label: t(`competency.scope.${scope}`) })))

// Whatever the draft's ladder is right now — the requirement rows pick from
// this, so a requirement can never point above the top rung.
const levelOptions = computed(() =>
  draft.value.levels.map((level, index) => ({
    value: index + 1,
    label: `${index + 1} · ${level.label || t('competency.level')}`,
  }))
)

async function load() {
  loading.value = true
  try {
    items.value = await competenciesApi.list({ status: status.value })
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.loadError')))
  } finally {
    loading.value = false
  }
}

function openNew() {
  editingId.value = ''
  draft.value = emptyDraft()
  modalOpen.value = true
}

function openEdit(item) {
  editingId.value = item.id
  draft.value = {
    code: item.code,
    name: item.name,
    description: item.description ?? '',
    category: item.category ?? '',
    validityDays: item.validityDays ?? 0,
    status: item.status,
    order: item.order ?? 0,
    levels: item.levels.length ? item.levels.map((level) => ({ label: level.label })) : [{ label: '' }],
    requirements: item.requirements.map((requirement) => ({ ...requirement })),
  }
  modalOpen.value = true
}

function addLevel() {
  if (draft.value.levels.length >= 10) return
  draft.value.levels.push({ label: '' })
}

function removeLevel(index) {
  draft.value.levels.splice(index, 1)
  // The rungs renumber, so a requirement left pointing past the new top
  // would be unreachable — pull it down rather than let the server refuse
  // the whole save.
  const max = draft.value.levels.length
  for (const requirement of draft.value.requirements) {
    if (requirement.level > max) requirement.level = max || 1
  }
}

function addRequirement() {
  draft.value.requirements.push({ scope: 'POSITION', value: '', level: 1 })
}

function payloadFrom(draftValue) {
  return {
    code: draftValue.code.trim(),
    name: draftValue.name.trim(),
    description: draftValue.description.trim(),
    category: draftValue.category.trim(),
    validityDays: Number(draftValue.validityDays) || 0,
    status: draftValue.status,
    order: Number(draftValue.order) || 0,
    // Numbered here, not typed: consecutive-from-1 is a rule the server
    // enforces and there is nothing for a person to decide about it.
    levels: draftValue.levels.map((level, index) => ({
      value: index + 1,
      label: level.label.trim() || String(index + 1),
    })),
    requirements: draftValue.requirements
      .filter((requirement) => requirement.value.trim())
      .map((requirement) => ({
        scope: requirement.scope,
        value: requirement.value.trim(),
        level: Number(requirement.level) || 1,
      })),
  }
}

async function save() {
  if (!draft.value.code.trim() || !draft.value.name.trim()) {
    toast.error(t('competency.codeAndNameRequired'))
    return
  }
  if (!draft.value.levels.length) {
    toast.error(t('competency.levelsRequired'))
    return
  }
  saving.value = true
  try {
    const payload = payloadFrom(draft.value)
    if (editingId.value) {
      // The code is the stable identifier other things point at; it is shown
      // read-only when editing and not sent back.
      delete payload.code
      await competenciesApi.update(editingId.value, payload)
    } else {
      await competenciesApi.create(payload)
    }
    modalOpen.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('competency.saveError')))
  } finally {
    saving.value = false
  }
}

async function remove(item) {
  const ok = await confirm({ title: t('competency.deleteTitle'), message: t('competency.deleteMessage') })
  if (!ok) return
  try {
    await competenciesApi.remove(item.id)
    toast.success(t('competency.deleted'))
    await load()
  } catch (error) {
    // The server refuses to delete anything somebody holds and says to
    // archive instead — that sentence is the useful one, so it is shown.
    toast.error(apiErrorText(error, t('competency.saveError')))
  }
}

onMounted(() => {
  load()
  loadFolders()
})
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('competency.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('competency.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
          :title="t('competency.folders.new')"
          :aria-label="t('competency.folders.new')"
          @click="openNewFolder"
        >
          <Icon name="layers" size="18" />
        </button>
        <AppButton icon="plus" @click="openNew">{{ t('competency.new') }}</AppButton>
      </div>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <AppInput
        v-model="search"
        class="w-64"
        icon="search"
        :aria-label="t('competency.searchCatalog')"
        :placeholder="t('competency.searchCatalog')"
      />
      <AppSelect
        v-model="category"
        class="w-48"
        :aria-label="t('competency.category')"
        :placeholder="t('competency.allCategories')"
        :options="categories.map((entry) => ({ value: entry, label: entry }))"
      />
      <AppSelect
        v-model="status"
        class="w-40"
        :aria-label="t('competency.status.ACTIVE')"
        :options="statusOptions"
        @update:model-value="load"
      />
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 4" :key="n" class="h-20 w-full rounded-lg" />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !tree.folders.length"
      class="mt-6"
      icon="layers"
      :title="t('competency.empty')"
      :description="t('competency.emptyHint')"
    />

    <!-- The tree (rasm): a folder row opens to its competencies; a
         competency row carries the ladder and, on hover, its actions. -->
    <div v-else class="mt-4">
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] gap-3 border-b border-border px-3 pb-2 text-[12px] font-medium text-ink-muted">
        <span>{{ t('competency.name') }}</span>
        <span>{{ t('competency.description') }}</span>
        <span />
      </div>
      <div class="divide-y divide-border">
        <template v-for="folder in tree.folders" :key="folder.id">
          <div class="group/row grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-3 px-3 py-3 transition-default hover:bg-surface-2">
            <button type="button" class="flex min-w-0 items-center gap-2 text-left" @click="toggleFolder(folder)">
              <Icon :name="isOpen(folder) ? 'chevron-down' : 'chevron-right'" size="14" class="shrink-0 text-ink-faint" />
              <Icon name="layers" size="18" class="shrink-0 text-ink-faint" />
              <span class="truncate text-[14px] text-ink">{{ folder.name }}</span>
              <span class="text-caption text-ink-faint">{{ folder.items.length }}</span>
            </button>
            <span class="truncate text-small text-ink-muted">{{ folder.description || '—' }}</span>
            <span class="relative flex items-center justify-end gap-0.5 opacity-0 transition-default group-hover/row:opacity-100 focus-within:opacity-100" :class="menuFor === 'f:' + folder.id ? 'opacity-100' : ''">
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('competency.folders.addHere')" @click="openNewIn(folder)"><Icon name="plus" size="15" /></button>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="openEditFolder(folder)"><Icon name="pencil" size="15" /></button>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-danger" :aria-label="t('common.delete')" @click="removeFolder(folder)"><Icon name="trash" size="15" /></button>
            </span>
          </div>
          <template v-if="isOpen(folder)">
            <div v-for="item in folder.items" :key="item.id" class="group/row grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-3 py-3 pl-12 pr-3 transition-default hover:bg-surface-2">
              <button type="button" class="flex min-w-0 items-center gap-2 text-left" @click="openEdit(item)">
                <Icon name="award" size="17" class="shrink-0 text-ink-faint" />
                <span class="truncate text-[14px] text-ink">{{ item.name }}</span>
                <span class="rounded bg-surface-2 px-1.5 py-0.5 text-caption text-ink-faint">{{ item.code }}</span>
                <Badge v-if="item.status === 'ARCHIVED'" variant="neutral" size="sm">{{ t('competency.status.ARCHIVED') }}</Badge>
              </button>
              <span class="truncate text-small text-ink-muted">{{ item.description || '—' }}</span>
              <span class="relative flex items-center justify-end gap-0.5 opacity-0 transition-default group-hover/row:opacity-100 focus-within:opacity-100" :class="menuFor === item.id ? 'opacity-100' : ''">
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('competency.edit')" @click="openEdit(item)"><Icon name="pencil" size="15" /></button>
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('competency.folders.move')" @click="menuFor = menuFor === item.id ? '' : item.id"><Icon name="more-horizontal" size="15" /></button>
                <div v-if="menuFor === item.id" class="absolute right-0 top-9 z-20 w-56 rounded-md border border-border bg-surface py-1 text-[13px] shadow-md">
                  <p class="px-3 py-1.5 text-caption font-semibold uppercase tracking-wide text-ink-faint">{{ t('competency.folders.move') }}</p>
                  <button v-for="name in categories.filter((n) => n !== item.category)" :key="name" type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2" @click="moveTo(item, name)"><Icon name="layers" size="13" class="text-ink-faint" /> {{ name }}</button>
                  <button v-if="item.category" type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2" @click="moveTo(item, '')"><Icon name="arrow-left" size="13" class="text-ink-faint" /> {{ t('competency.folders.root') }}</button>
                  <div class="my-1 border-t border-border" />
                  <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-danger hover:bg-surface-2" @click="menuFor = ''; remove(item)"><Icon name="trash" size="13" /> {{ t('common.delete') }}</button>
                </div>
              </span>
            </div>
          </template>
        </template>

        <div v-for="item in tree.loose" :key="item.id" class="group/row grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-3 px-3 py-3 transition-default hover:bg-surface-2">
          <button type="button" class="flex min-w-0 items-center gap-2 pl-5 text-left" @click="openEdit(item)">
            <Icon name="award" size="17" class="shrink-0 text-ink-faint" />
            <span class="truncate text-[14px] text-ink">{{ item.name }}</span>
            <span class="rounded bg-surface-2 px-1.5 py-0.5 text-caption text-ink-faint">{{ item.code }}</span>
            <Badge v-if="item.status === 'ARCHIVED'" variant="neutral" size="sm">{{ t('competency.status.ARCHIVED') }}</Badge>
          </button>
          <span class="truncate text-small text-ink-muted">{{ item.description || '—' }}</span>
          <span class="relative flex items-center justify-end gap-0.5 opacity-0 transition-default group-hover/row:opacity-100 focus-within:opacity-100" :class="menuFor === item.id ? 'opacity-100' : ''">
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('competency.edit')" @click="openEdit(item)"><Icon name="pencil" size="15" /></button>
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('competency.folders.move')" @click="menuFor = menuFor === item.id ? '' : item.id"><Icon name="more-horizontal" size="15" /></button>
            <div v-if="menuFor === item.id" class="absolute right-0 top-9 z-20 w-56 rounded-md border border-border bg-surface py-1 text-[13px] shadow-md">
              <p class="px-3 py-1.5 text-caption font-semibold uppercase tracking-wide text-ink-faint">{{ t('competency.folders.move') }}</p>
              <button v-for="name in categories" :key="name" type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2" @click="moveTo(item, name)"><Icon name="layers" size="13" class="text-ink-faint" /> {{ name }}</button>
              <div class="my-1 border-t border-border" />
              <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-danger hover:bg-surface-2" @click="menuFor = ''; remove(item)"><Icon name="trash" size="13" /> {{ t('common.delete') }}</button>
            </div>
          </span>
        </div>
      </div>
    </div>

    <Modal v-model="folderModalOpen" size="sm" :title="folderDraft.id ? t('competency.folders.edit') : t('competency.folders.new')">
      <div class="space-y-4">
        <AppInput v-model="folderDraft.name" :label="t('competency.folders.name')" required />
        <AppInput v-model="folderDraft.description" :label="t('competency.description')" />
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="folderModalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="saveFolder">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <Modal v-model="modalOpen" size="lg" :title="editingId ? t('competency.edit') : t('competency.new')">
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <AppInput
            v-model="draft.code"
            :label="t('competency.code')"
            :hint="t('competency.codeHint')"
            :disabled="Boolean(editingId)"
            required
          />
          <AppInput v-model="draft.name" :label="t('competency.name')" required />
        </div>

        <AppInput v-model="draft.description" :label="t('competency.description')" />

        <div class="grid gap-3 sm:grid-cols-3">
          <AppSelect v-model="draft.category" :label="t('competency.folders.folder')" :placeholder="t('competency.folders.root')" :options="categories.map((entry) => ({ value: entry, label: entry }))" />
          <AppInput
            v-model="draft.validityDays"
            type="number"
            :label="t('competency.validityDays')"
            :hint="t('competency.validityHint')"
          />
          <AppSelect v-model="draft.status" :label="t('competency.status.ACTIVE')" :options="statusOptions" />
        </div>

        <!-- The ladder -->
        <div class="rounded-lg border border-border p-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-small font-medium text-ink">{{ t('competency.levels') }}</p>
              <p class="text-caption text-ink-faint">{{ t('competency.levelsHint') }}</p>
            </div>
            <AppButton variant="ghost" size="sm" icon="plus" @click="addLevel">
              {{ t('competency.addLevel') }}
            </AppButton>
          </div>
          <div class="mt-3 space-y-2">
            <div v-for="(level, index) in draft.levels" :key="index" class="flex items-center gap-2">
              <span class="w-7 shrink-0 text-center text-small text-ink-muted">{{ index + 1 }}</span>
              <AppInput v-model="level.label" class="flex-1" :aria-label="t('competency.levelLabel')" />
              <AppButton
                variant="ghost"
                size="sm"
                icon="trash"
                :disabled="draft.levels.length <= 1"
                @click="removeLevel(index)"
              />
            </div>
          </div>
        </div>

        <!-- Who has to hold it -->
        <div class="rounded-lg border border-border p-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-small font-medium text-ink">{{ t('competency.requirements') }}</p>
              <p class="text-caption text-ink-faint">{{ t('competency.requirementsHint') }}</p>
            </div>
            <AppButton variant="ghost" size="sm" icon="plus" @click="addRequirement">
              {{ t('competency.addRequirement') }}
            </AppButton>
          </div>
          <p v-if="!draft.requirements.length" class="mt-2 text-caption text-ink-faint">
            {{ t('competency.noRequirements') }}
          </p>
          <div class="mt-3 space-y-2">
            <div v-for="(requirement, index) in draft.requirements" :key="index" class="flex items-center gap-2">
              <AppSelect
                v-model="requirement.scope"
                class="w-36 shrink-0"
                :aria-label="t('competency.requirements')"
                :options="scopeOptions"
              />
              <AppInput
                v-model="requirement.value"
                class="flex-1"
                :aria-label="t('competency.requirementValue')"
                :placeholder="t('competency.requirementValue')"
              />
              <AppSelect
                v-model="requirement.level"
                class="w-40 shrink-0"
                :aria-label="t('competency.requiredLevel')"
                :options="levelOptions"
              />
              <AppButton variant="ghost" size="sm" icon="trash" @click="draft.requirements.splice(index, 1)" />
            </div>
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
