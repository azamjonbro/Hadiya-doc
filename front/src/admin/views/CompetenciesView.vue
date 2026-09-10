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

const categories = computed(() => [...new Set(items.value.map((item) => item.category).filter(Boolean))].sort())

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

onMounted(load)
</script>

<template>
  <div class="px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-h1 text-ink">{{ t('competency.title') }}</h1>
        <p class="mt-1 text-small text-ink-muted">{{ t('competency.subtitle') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('competency.new') }}</AppButton>
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
      v-else-if="!filtered.length"
      class="mt-6"
      icon="layers"
      :title="t('competency.empty')"
      :description="t('competency.emptyHint')"
    />

    <div v-else class="mt-4 space-y-3">
      <AppCard v-for="item in filtered" :key="item.id" class="flex flex-wrap items-start justify-between gap-4 p-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded bg-surface-2 px-1.5 py-0.5 text-caption text-ink-muted">{{ item.code }}</span>
            <p class="truncate font-medium text-ink">{{ item.name }}</p>
            <Badge v-if="item.category" variant="info" size="sm">{{ item.category }}</Badge>
            <Badge v-if="item.status === 'ARCHIVED'" variant="neutral" size="sm">
              {{ t('competency.status.ARCHIVED') }}
            </Badge>
          </div>

          <p v-if="item.description" class="mt-1 line-clamp-2 text-small text-ink-muted">{{ item.description }}</p>

          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              v-for="level in item.levels"
              :key="level.value"
              class="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink-muted"
            >
              {{ level.value }} · {{ level.label }}
            </span>
          </div>

          <p class="mt-2 text-caption text-ink-faint">
            <template v-if="item.requirements.length">
              <span v-for="requirement in item.requirements" :key="requirement.id" class="mr-3">
                <Icon name="users" size="11" class="mr-1 inline" />
                {{ t(`competency.scope.${requirement.scope}`) }}: {{ requirement.value }} →
                {{ t('competency.level') }} {{ requirement.level }}
              </span>
            </template>
            <template v-else>{{ t('competency.noRequirements') }}</template>
            ·
            {{
              item.validityDays
                ? t('competency.validityDays') + ': ' + item.validityDays
                : t('competency.neverExpires')
            }}
          </p>
        </div>

        <div class="flex shrink-0 gap-2">
          <AppButton variant="secondary" size="sm" icon="edit" @click="openEdit(item)">
            {{ t('competency.edit') }}
          </AppButton>
          <AppButton variant="ghost" size="sm" icon="trash" @click="remove(item)" />
        </div>
      </AppCard>
    </div>

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
          <AppInput v-model="draft.category" :label="t('competency.category')" :hint="t('competency.categoryHint')" />
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
