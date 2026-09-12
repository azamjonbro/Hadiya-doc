<script setup>
/**
 * Rating scales for observation-sheet items (rasm: «Оценочные шкалы»): a
 * list with the locked Yes/No first, and an editor for the rest — name,
 * the levels top to bottom, points per level, which ones count as a pass.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ojtApi } from '@/services/ojt'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const scales = ref([])
const loading = ref(true)
const modalOpen = ref(false)
const saving = ref(false)
const editing = ref(null)
const draft = ref(blank())

function blank() {
  return {
    name: '',
    description: '',
    levels: [
      { label: '', points: 0, passes: false },
      { label: '', points: 1, passes: true },
    ],
  }
}

const canSave = computed(
  () => draft.value.name.trim().length > 0 && draft.value.levels.length >= 2 && draft.value.levels.every((l) => l.label.trim())
)

async function load() {
  loading.value = true
  try {
    scales.value = await ojtApi.scales()
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.loadError')))
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = null
  draft.value = blank()
  modalOpen.value = true
}

function openEdit(scale) {
  if (scale.isSystem) return
  editing.value = scale
  draft.value = { name: scale.name, description: scale.description, levels: scale.levels.map((l) => ({ ...l })) }
  modalOpen.value = true
}

function addLevel() {
  const top = Math.max(0, ...draft.value.levels.map((l) => Number(l.points) || 0))
  draft.value.levels.push({ label: '', points: top + 1, passes: true })
}

function removeLevel(index) {
  if (draft.value.levels.length <= 2) return
  draft.value.levels.splice(index, 1)
}

async function save() {
  if (!canSave.value) {
    toast.error(draft.value.name.trim() ? t('ojt.scales.levelRequired') : t('ojt.scales.nameRequired'))
    return
  }
  saving.value = true
  try {
    const payload = {
      name: draft.value.name.trim(),
      description: draft.value.description.trim(),
      levels: draft.value.levels.map((l) => ({ label: l.label.trim(), points: Number(l.points) || 0, passes: Boolean(l.passes) })),
    }
    if (editing.value) await ojtApi.updateScale(editing.value.id, payload)
    else await ojtApi.createScale(payload)
    modalOpen.value = false
    toast.success(t('ojt.scales.saved'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  } finally {
    saving.value = false
  }
}

async function remove(scale) {
  const ok = await confirm.ask({
    title: t('ojt.scales.deleteTitle'),
    message: t('ojt.scales.deleteMessage', { name: scale.name }),
    confirmLabel: t('common.delete'),
  })
  if (!ok) return
  try {
    await ojtApi.removeScale(scale.id)
    toast.success(t('ojt.scales.deleted'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('ojt.saveError')))
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('ojt.scales.title') }}</h1>
        <p class="mt-1 max-w-3xl text-[13px] text-ink-muted">{{ t('ojt.scales.hint') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('ojt.scales.new') }}</AppButton>
    </div>

    <div v-if="loading" class="mt-8 space-y-2"><Skeleton v-for="i in 4" :key="i" class="h-12 w-full" /></div>
    <EmptyState v-else-if="!scales.length" class="mt-8" icon="list" :title="t('ojt.scales.empty')" />
    <div v-else class="mt-6">
      <p class="border-b border-border px-3 pb-2 text-[12px] font-medium text-ink-muted">{{ t('ojt.scales.name') }}</p>
      <ul class="divide-y divide-border">
        <li v-for="scale in scales" :key="scale.id" class="flex items-center gap-3 px-3 py-3.5 transition-default hover:bg-surface-2">
          <Icon name="list" size="18" class="shrink-0 text-ink-faint" />
          <button type="button" class="min-w-0 flex-1 text-left" :class="scale.isSystem ? 'cursor-default' : ''" @click="openEdit(scale)">
            <span class="text-[14px] text-ink">{{ scale.name }}</span>
            <Icon v-if="scale.isSystem" name="lock" size="13" class="ml-2 inline text-ink-faint" :title="t('ojt.scales.locked')" />
            <span class="ml-3 text-caption text-ink-faint">{{ scale.levels.map((l) => `${l.label} (${l.points})`).join(' · ') }}</span>
          </button>
          <template v-if="!scale.isSystem">
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="openEdit(scale)"><Icon name="pencil" size="15" /></button>
            <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-hover hover:text-danger" :aria-label="t('common.delete')" @click="remove(scale)"><Icon name="trash" size="15" /></button>
          </template>
        </li>
      </ul>
    </div>

    <Modal v-model="modalOpen" size="md" :title="editing ? t('ojt.scales.edit') : t('ojt.scales.new')">
      <div class="space-y-4">
        <AppInput v-model="draft.name" :label="t('ojt.scales.name')" required />
        <AppInput v-model="draft.description" :label="t('ojt.scales.description')" />

        <div>
          <p class="mb-1.5 text-small font-medium text-ink">{{ t('ojt.scales.levels') }}</p>
          <p class="mb-3 text-caption text-ink-faint">{{ t('ojt.scales.levelsHint') }}</p>
          <div class="space-y-2">
            <div v-for="(level, index) in draft.levels" :key="index" class="flex items-center gap-2">
              <span class="w-6 text-caption text-ink-faint">{{ index + 1 }}.</span>
              <input
                v-model="level.label"
                type="text"
                :placeholder="t('ojt.scales.level')"
                class="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-small text-ink outline-none focus:border-primary"
              />
              <input
                v-model.number="level.points"
                type="number"
                min="0"
                :title="t('ojt.scales.points')"
                class="h-9 w-20 rounded-md border border-border-strong bg-surface px-2 text-small text-ink outline-none focus:border-primary"
              />
              <label class="flex items-center gap-1.5 whitespace-nowrap text-caption text-ink-muted" :title="t('ojt.scales.passes')">
                <input v-model="level.passes" type="checkbox" class="h-3.5 w-3.5 rounded border-border-strong accent-primary" />
                <Icon name="check-circle" size="14" />
              </label>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:text-danger disabled:opacity-30" :disabled="draft.levels.length <= 2" :aria-label="t('common.delete')" @click="removeLevel(index)">
                <Icon name="close" size="14" />
              </button>
            </div>
          </div>
          <button type="button" class="mt-3 flex items-center gap-1.5 text-small text-primary hover:underline" @click="addLevel">
            <Icon name="plus" size="14" /> {{ t('ojt.scales.addLevel') }}
          </button>
          <p class="mt-2 text-caption text-ink-faint">{{ t('ojt.scales.points') }} · <Icon name="check-circle" size="12" class="inline" /> = {{ t('ojt.scales.passes') }}</p>
        </div>
      </div>
      <template #footer>
        <AppButton variant="ghost" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="!canSave" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
