<script setup>
/**
 * Plan types (rasn 14): name (a lock on the two built-in ones), the
 * outcomes as green/red chips, description, status; "Create plan type"
 * opens a small form with a name, a description and the outcome pairs.
 */
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { developmentPlansApi } from '@/services/developmentPlans'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const items = ref(null)
const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({ id: '', name: '', description: '', outcomes: [] })

async function load() {
  try {
    items.value = await developmentPlansApi.types()
  } catch (error) {
    toast.error(apiErrorText(error))
    items.value = []
  }
}

function openNew() {
  Object.assign(form, {
    id: '',
    name: '',
    description: '',
    outcomes: [
      { key: 'DONE', label: t('devplan.types.defaultPositive'), positive: true },
      { key: 'NOT_DONE', label: t('devplan.types.defaultNegative'), positive: false },
    ],
  })
  modalOpen.value = true
}

function openEdit(type) {
  Object.assign(form, { id: type.id, name: type.name, description: type.description, outcomes: type.outcomes.map((o) => ({ ...o })) })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = { name: form.name, description: form.description, outcomes: form.outcomes.filter((o) => o.label.trim()) }
    if (form.id) {
      const current = items.value.find((item) => item.id === form.id)
      // A built-in type keeps its outcomes; the API refuses them anyway.
      if (current?.isSystem) delete payload.outcomes
      await developmentPlansApi.updateType(form.id, payload)
    } else await developmentPlansApi.createType(payload)
    modalOpen.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}

async function remove(type) {
  const ok = await confirm({ title: t('common.delete'), message: type.name, variant: 'danger' })
  if (!ok) return
  try {
    await developmentPlansApi.removeType(type.id)
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-6 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('devplan.types.title') }}</h1>
        <p class="mt-1 max-w-3xl text-[14px] text-ink-muted">{{ t('devplan.types.hint') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('devplan.types.create') }}</AppButton>
    </div>

    <Skeleton v-if="!items" class="mt-6 h-40 rounded-lg" />
    <table v-else class="mt-6 w-full text-[14px]">
      <thead>
        <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
          <th class="pl-3 pr-2 font-medium">{{ t('devplan.types.name') }}</th>
          <th class="px-2 font-medium">{{ t('devplan.types.outcomes') }}</th>
          <th class="px-2 font-medium">{{ t('courses.fields.description') }}</th>
          <th class="w-32 px-2"></th>
          <th class="w-24 pr-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="type in items" :key="type.id" class="group h-16 border-b border-border last:border-b-0 hover:bg-surface-2">
          <td class="pl-3 pr-2">
            <span class="flex items-center gap-2 text-ink">{{ type.name }}<Icon v-if="type.isSystem" name="lock" size="13" class="text-ink-faint" /></span>
          </td>
          <td class="px-2">
            <span class="flex flex-wrap gap-1.5">
              <span
                v-for="outcome in type.outcomes"
                :key="outcome.key"
                class="flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px]"
                :class="outcome.positive ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'"
              >
                <Icon :name="outcome.positive ? 'check' : 'close'" size="12" />{{ outcome.label }}
              </span>
            </span>
          </td>
          <td class="px-2"><p class="line-clamp-2 text-ink-muted">{{ type.description || '—' }}</p></td>
          <td class="px-2"><span class="rounded-full bg-surface-hover px-2.5 py-0.5 text-[12px] text-ink-muted">{{ type.status === 'PUBLISHED' ? t('courses.status.published') : t('devplan.templates.hidden') }}</span></td>
          <td class="pr-3 text-right">
            <span class="flex items-center justify-end gap-1 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="openEdit(type)"><Icon name="pencil" size="15" /></button>
              <button v-if="!type.isSystem" type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-danger" :aria-label="t('common.delete')" @click="remove(type)"><Icon name="trash" size="15" /></button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <Modal v-model="modalOpen" :title="form.id ? t('common.edit') : t('devplan.types.create')">
      <div class="space-y-4">
        <AppInput v-model="form.name" :label="t('devplan.types.name')" required />
        <AppInput v-model="form.description" :label="t('courses.fields.description')" />
        <div>
          <p class="mb-1.5 text-small font-medium text-ink">{{ t('devplan.types.outcomes') }}</p>
          <div v-for="(outcome, index) in form.outcomes" :key="index" class="mb-2 flex items-center gap-2">
            <Icon :name="outcome.positive ? 'check' : 'close'" size="14" :class="outcome.positive ? 'text-success' : 'text-danger'" />
            <AppInput v-model="outcome.label" class="flex-1" />
          </div>
          <p class="text-caption text-ink-faint">{{ t('devplan.types.outcomesHint') }}</p>
        </div>
      </div>
      <template #footer>
        <AppButton variant="ghost" @click="modalOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="!form.name.trim()" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
