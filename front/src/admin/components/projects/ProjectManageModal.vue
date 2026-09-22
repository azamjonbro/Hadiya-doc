<script setup>
/**
 * «Управление проектом» (rasm 5): the name with its 255 counter, selected
 * on open so a freshly made «Yangi loyiha (…)» is overtyped in one go;
 * «Loyiha a'zolari» with the add button on the right; the owner's row
 * first, then every member with an access select and a remove; and at the
 * bottom «Loyihani o'chirish» on the left, «Tayyor» on the right.
 *
 * "Tayyor" saves the name if it changed. Members are saved as they are
 * changed — the reference does the same, and a dialog that batches member
 * edits behind one button loses them when it is closed with Escape.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { projectsApi } from '@/services/projects'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import { roleLabel } from '@/utils/roleLabel'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import AddMembersModal from './AddMembersModal.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue', 'updated', 'deleted'])
const { t, te } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const NAME_MAX = 255
const name = ref('')
const nameInput = ref(null)
const saving = ref(false)
const addOpen = ref(false)

const canManage = computed(() => props.project.access === 'OWNER')

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    name.value = props.project.name
    await nextTick()
    nameInput.value?.focus()
    nameInput.value?.select()
  },
  // Immediate: the dialog can mount already open (a project made from the
  // sidebar's "+" lands straight in it), and a watch that waits for the
  // next change would leave the name field blank.
  { immediate: true },
)

async function done() {
  const trimmed = name.value.trim()
  if (canManage.value && trimmed && trimmed !== props.project.name) {
    saving.value = true
    try {
      emit('updated', await projectsApi.rename(props.project.id, trimmed))
    } catch (error) {
      toast.error(apiErrorText(error))
      saving.value = false
      return
    }
    saving.value = false
  }
  emit('update:modelValue', false)
}

async function setAccess(member, access) {
  try {
    emit('updated', await projectsApi.setMemberAccess(props.project.id, member.id, access))
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}

async function removeMember(member) {
  try {
    emit('updated', await projectsApi.removeMember(props.project.id, member.id))
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}

async function remove() {
  const ok = await confirm({
    title: t('projects.delete.title'),
    message: t('projects.delete.message', { name: props.project.name, n: props.project.courseCount ?? 0 }),
    confirmLabel: t('projects.delete.confirm'),
  })
  if (!ok) return
  try {
    await projectsApi.remove(props.project.id)
    toast.success(t('projects.delete.done'))
    emit('update:modelValue', false)
    emit('deleted', props.project.id)
  } catch (error) {
    toast.error(apiErrorText(error))
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="t('projects.manage.title')" size="lg" @update:model-value="$emit('update:modelValue', $event)">
    <label class="block text-[15px] text-ink" for="project-name">{{ t('projects.manage.name') }}</label>
    <div class="relative mt-2">
      <input
        id="project-name"
        ref="nameInput"
        v-model="name"
        type="text"
        :maxlength="NAME_MAX"
        :readonly="!canManage"
        class="h-11 w-full rounded-lg border-2 bg-surface pl-3 pr-20 text-[15px] text-ink transition-default focus:outline-none focus-visible:outline-none"
        :class="canManage ? 'border-border-strong focus:border-primary focus:ring-1 focus:ring-primary' : 'border-border bg-surface-2'"
        @keydown.enter.prevent="done"
      />
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] tabular-nums text-ink-faint">{{ name.length }}/{{ NAME_MAX }}</span>
    </div>

    <div class="mt-7 flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-[18px] font-medium text-ink">{{ t('projects.manage.members') }}</h3>
      <AppButton v-if="canManage" variant="outline" icon="user-plus" @click="addOpen = true">{{ t('projects.members.addTitle') }}</AppButton>
    </div>

    <ul class="mt-3 divide-y divide-border border-t border-border">
      <li v-if="project.owner" class="flex items-center gap-3 py-3">
        <Avatar :name="project.owner.fullName" :src="project.owner.avatar" size="md" />
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="truncate text-[15px] text-ink">{{ project.owner.fullName }}</span>
            <Badge v-if="project.owner.role && project.owner.role !== 'EMPLOYEE'" variant="success" size="sm">{{ roleLabel(project.owner.role, { t, te }) }}</Badge>
          </span>
          <span class="block truncate text-[13px] text-ink-muted">{{ project.owner.email || project.owner.position }}</span>
        </span>
        <span class="shrink-0 text-[14px] text-ink">{{ t('projects.manage.owner') }}</span>
      </li>
      <li v-for="member in project.members" :key="member.id" class="flex items-center gap-3 py-3">
        <Avatar :name="member.fullName" :src="member.avatar" size="md" />
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="truncate text-[15px] text-ink">{{ member.fullName }}</span>
            <Badge v-if="member.role && member.role !== 'EMPLOYEE'" variant="success" size="sm">{{ roleLabel(member.role, { t, te }) }}</Badge>
          </span>
          <span class="block truncate text-[13px] text-ink-muted">{{ member.email || member.position }}</span>
        </span>
        <template v-if="canManage">
          <select
            class="h-9 rounded-lg border border-border bg-surface px-2 text-[13px] text-ink"
            :value="member.access"
            :aria-label="t('projects.access.label')"
            @change="setAccess(member, $event.target.value)"
          >
            <option value="VIEW">{{ t('projects.access.VIEW') }}</option>
            <option value="EDIT">{{ t('projects.access.EDIT') }}</option>
          </select>
          <button
            type="button"
            class="rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-danger"
            :aria-label="t('projects.members.remove')"
            @click="removeMember(member)"
          >
            <Icon name="close" size="16" />
          </button>
        </template>
        <span v-else class="shrink-0 text-[13px] text-ink-muted">{{ t(`projects.access.${member.access}`) }}</span>
      </li>
      <li v-if="!project.members?.length" class="py-6 text-center text-small text-ink-faint">{{ t('projects.manage.noMembers') }}</li>
    </ul>

    <template #footer>
      <AppButton v-if="canManage" variant="secondary" class="mr-auto" @click="remove">{{ t('projects.delete.action') }}</AppButton>
      <AppButton :loading="saving" @click="done">{{ t('projects.manage.done') }}</AppButton>
    </template>

    <AddMembersModal v-model="addOpen" :project="project" @added="$emit('updated', $event)" />
  </Modal>
</template>
