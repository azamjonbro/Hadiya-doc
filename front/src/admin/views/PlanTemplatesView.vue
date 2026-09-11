<script setup>
/**
 * Plan templates (rasn 13): cover, name, type, status, assignments,
 * last change (by whom), description; "Create plan" on a row hands the
 * template to people — one DRAFT plan each — and the goals travel as
 * copies (see planTemplate.service.js).
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { developmentPlansApi } from '@/services/developmentPlans'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppDatePicker from '@/components/ui/AppDatePicker.vue'
import ImageUploadField from '@/components/ui/ImageUploadField.vue'
import UserPicker from '@/components/ui/UserPicker.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const items = ref(null)
const types = ref([])
const typeOptions = computed(() => types.value.map((type) => ({ value: type.id, label: type.name })))
const typeName = (id) => types.value.find((type) => type.id === id)?.name ?? '—'

async function load() {
  try {
    ;[items.value, types.value] = await Promise.all([developmentPlansApi.templates(), developmentPlansApi.types()])
  } catch (error) {
    toast.error(apiErrorText(error))
    items.value = []
  }
}

// ----- editor -----
const editorOpen = ref(false)
const saving = ref(false)
const form = reactive({ id: '', name: '', typeId: '', description: '', cover: '', durationDays: 90, status: 'PUBLISHED', goals: [] })
const GOAL_TYPES = ['CUSTOM', 'COURSE', 'COMPETENCY', 'OJT']

function openNew() {
  Object.assign(form, { id: '', name: '', typeId: types.value[0]?.id ?? '', description: '', cover: '', durationDays: 90, status: 'PUBLISHED', goals: [] })
  editorOpen.value = true
}
function openEdit(template) {
  Object.assign(form, { ...template, goals: template.goals.map((goal) => ({ ...goal })) })
  editorOpen.value = true
}
function addGoal() {
  form.goals.push({ type: 'CUSTOM', title: '', description: '', dueInDays: null, weight: 1 })
}
async function save() {
  saving.value = true
  try {
    const payload = {
      name: form.name,
      typeId: form.typeId,
      description: form.description,
      cover: form.cover,
      durationDays: Number(form.durationDays) || 90,
      status: form.status,
      goals: form.goals
        .filter((goal) => goal.title.trim())
        .map((goal) => ({ type: goal.type, title: goal.title, description: goal.description ?? '', dueInDays: goal.dueInDays === '' || goal.dueInDays == null ? null : Number(goal.dueInDays), weight: Number(goal.weight) || 1 })),
    }
    if (form.id) await developmentPlansApi.updateTemplate(form.id, payload)
    else await developmentPlansApi.createTemplate(payload)
    editorOpen.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    saving.value = false
  }
}
async function remove(template) {
  const ok = await confirm({ title: t('common.delete'), message: template.name, variant: 'danger' })
  if (!ok) return
  try {
    await developmentPlansApi.removeTemplate(template.id)
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}

// ----- assign -----
const assignOpen = ref(false)
const assigning = ref(false)
const assignFor = ref(null)
const assign = reactive({ people: [], pickerId: '', periodStart: '', status: 'DRAFT' })
function openAssign(template) {
  assignFor.value = template
  Object.assign(assign, { people: [], pickerId: '', periodStart: new Date().toISOString().slice(0, 10), status: 'DRAFT' })
  assignOpen.value = true
}
function addPerson(user) {
  if (!assign.people.some((p) => p.id === user.id)) assign.people.push({ id: user.id, fullName: user.fullName })
  assign.pickerId = ''
}
async function runAssign() {
  assigning.value = true
  try {
    const result = await developmentPlansApi.assignTemplate(assignFor.value.id, {
      userIds: assign.people.map((p) => p.id),
      periodStart: new Date(assign.periodStart).toISOString(),
      status: assign.status,
    })
    toast.success(t('devplan.templates.assigned', { count: result.created.length }))
    if (result.skipped.length) toast.error(t('devplan.templates.skipped', { count: result.skipped.length }))
    assignOpen.value = false
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    assigning.value = false
  }
}

const when = (value) => new Date(value).toLocaleString(locale.value, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

onMounted(load)
</script>

<template>
  <div class="px-6 py-6 lg:px-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-[24px] font-semibold text-ink">{{ t('devplan.templates.title') }}</h1>
        <p class="mt-1 max-w-3xl text-[14px] text-ink-muted">{{ t('devplan.templates.hint') }}</p>
      </div>
      <AppButton icon="plus" @click="openNew">{{ t('devplan.templates.create') }}</AppButton>
    </div>

    <Skeleton v-if="!items" class="mt-6 h-40 rounded-lg" />
    <EmptyState v-else-if="!items.length" icon="layers" :title="t('devplan.templates.empty')" class="mt-6" />
    <div v-else class="mt-6 overflow-x-auto">
      <table class="w-full min-w-[960px] text-[14px]">
        <thead>
          <tr class="h-11 border-b border-border text-left text-[13px] text-ink-muted">
            <th class="min-w-[280px] pl-3 pr-2 font-medium">{{ t('devplan.templates.name') }}</th>
            <th class="w-32 px-2 font-medium">{{ t('devplan.templates.type') }}</th>
            <th class="w-32 px-2 font-medium">{{ t('courses.status.label') }}</th>
            <th class="w-28 px-2 font-medium">{{ t('devplan.templates.assignments') }}</th>
            <th class="w-44 px-2 font-medium text-ink">{{ t('devplan.templates.lastChange') }} <Icon name="chevron-down" size="12" class="inline text-ink-faint" /></th>
            <th class="px-2 font-medium">{{ t('courses.fields.description') }}</th>
            <th class="w-40 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="template in items" :key="template.id" class="group h-[92px] border-b border-border last:border-b-0 hover:bg-surface-2">
            <td class="pl-3 pr-2">
              <span class="flex items-center gap-4">
                <span class="flex h-[68px] w-[100px] shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2 text-ink-faint">
                  <img v-if="template.cover" :src="template.cover" alt="" class="h-full w-full object-cover" />
                  <Icon v-else name="image" size="18" />
                </span>
                <span class="line-clamp-2 text-ink">{{ template.name }}</span>
              </span>
            </td>
            <td class="px-2 text-ink-muted"><span class="line-clamp-1">{{ typeName(template.typeId) }}</span></td>
            <td class="px-2"><span class="rounded-full px-2.5 py-0.5 text-[12px]" :class="template.status === 'PUBLISHED' ? 'bg-success-subtle text-success' : 'bg-surface-hover text-ink-muted'">{{ template.status === 'PUBLISHED' ? t('courses.status.published') : t('devplan.templates.hidden') }}</span></td>
            <td class="px-2 text-ink"><span class="underline decoration-dotted">{{ template.assignmentCount || '—' }}</span></td>
            <td class="px-2 text-ink-muted">
              <p class="text-ink">{{ when(template.updatedAt) }}</p>
              <p class="truncate text-caption uppercase">{{ template.updatedByName }}</p>
            </td>
            <td class="px-2"><p class="line-clamp-2 text-ink-muted">{{ template.description || '—' }}</p></td>
            <td class="pr-3 text-right">
              <span class="flex items-center justify-end gap-1 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100">
                <AppButton size="sm" variant="secondary" @click="openAssign(template)">{{ t('devplan.templates.createPlan') }}</AppButton>
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink" :aria-label="t('common.edit')" @click="openEdit(template)"><Icon name="pencil" size="15" /></button>
                <button type="button" class="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-danger" :aria-label="t('common.delete')" @click="remove(template)"><Icon name="trash" size="15" /></button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Editor -->
    <Modal v-model="editorOpen" size="lg" :title="form.id ? t('common.edit') : t('devplan.templates.create')">
      <div class="space-y-4">
        <AppInput v-model="form.name" :label="t('devplan.templates.name')" required />
        <div class="grid gap-3 sm:grid-cols-3">
          <AppSelect v-model="form.typeId" :label="t('devplan.templates.type')" :options="typeOptions" />
          <AppInput v-model="form.durationDays" type="number" :label="t('devplan.templates.duration')" />
          <AppSelect v-model="form.status" :label="t('courses.status.label')" :options="[{ value: 'PUBLISHED', label: t('courses.status.published') }, { value: 'HIDDEN', label: t('devplan.templates.hidden') }]" />
        </div>
        <AppInput v-model="form.description" :label="t('courses.fields.description')" />
        <ImageUploadField v-model="form.cover" :label="t('news.editor.cover')" aspect="aspect-[3/2]" />
        <div>
          <div class="flex items-center justify-between">
            <p class="text-small font-medium text-ink">{{ t('devplan.templates.goals') }}</p>
            <AppButton size="sm" variant="ghost" icon="plus" @click="addGoal">{{ t('devplan.addGoal') }}</AppButton>
          </div>
          <div v-for="(goal, index) in form.goals" :key="index" class="mt-2 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[120px_1fr_100px_80px_32px]">
            <AppSelect v-model="goal.type" :options="GOAL_TYPES.map((value) => ({ value, label: t(`devplan.type.${value}`) }))" />
            <AppInput v-model="goal.title" :placeholder="t('devplan.goalTitle')" />
            <AppInput v-model="goal.dueInDays" type="number" :placeholder="t('devplan.templates.dueInDays')" />
            <AppInput v-model="goal.weight" type="number" :placeholder="t('devplan.weight')" />
            <button type="button" class="flex h-9 w-8 items-center justify-center text-ink-faint hover:text-danger" :aria-label="t('common.delete')" @click="form.goals.splice(index, 1)"><Icon name="trash" size="14" /></button>
          </div>
        </div>
      </div>
      <template #footer>
        <AppButton variant="ghost" @click="editorOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="!form.name.trim() || !form.typeId" @click="save">{{ t('common.save') }}</AppButton>
      </template>
    </Modal>

    <!-- Assign -->
    <Modal v-model="assignOpen" :title="t('devplan.templates.createPlan')" :description="assignFor?.name">
      <div class="space-y-4">
        <UserPicker v-model="assign.pickerId" :label="t('devplan.employee')" :placeholder="t('devplan.selectEmployee')" @select="addPerson" />
        <div v-if="assign.people.length" class="flex flex-wrap gap-1.5">
          <span v-for="person in assign.people" :key="person.id" class="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-ink">
            {{ person.fullName }}
            <button type="button" class="text-ink-faint hover:text-danger" :aria-label="t('common.delete')" @click="assign.people = assign.people.filter((p) => p.id !== person.id)"><Icon name="close" size="12" /></button>
          </span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <AppDatePicker v-model="assign.periodStart" :label="t('devplan.periodStart')" required />
          <AppSelect v-model="assign.status" :label="t('courses.status.label')" :options="[{ value: 'DRAFT', label: t('devplan.status.DRAFT') }, { value: 'ACTIVE', label: t('devplan.status.ACTIVE') }]" />
        </div>
        <p class="text-caption text-ink-faint">{{ t('devplan.templates.assignHint', { days: assignFor?.durationDays ?? 90 }) }}</p>
      </div>
      <template #footer>
        <AppButton variant="ghost" @click="assignOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="assigning" :disabled="!assign.people.length || !assign.periodStart" @click="runAssign">{{ t('devplan.templates.createPlan') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
