<script setup>
/**
 * «Добавление участников» (rasm 6): a line saying what membership grants,
 * the access level on the right (view / edit — one level for everyone
 * picked, as the reference does), a search box with a select-all beside
 * it, and the colleagues as checkbox rows: avatar, name, role badge, email.
 * People already in the project are left out; there is nothing to add
 * them to.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { projectsApi } from '@/services/projects'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import { roleLabel } from '@/utils/roleLabel'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: Object, required: true },
})
const emit = defineEmits(['update:modelValue', 'added'])
const { t, te } = useI18n()
const toast = useToast()

const access = ref('EDIT')
const search = ref('')
const candidates = ref([])
const loading = ref(false)
const picked = ref([])
const submitting = ref(false)

const excluded = computed(() => new Set([props.project.ownerId, ...(props.project.members ?? []).map((m) => m.id)]))
const rows = computed(() => candidates.value.filter((user) => !excluded.value.has(user.id)))
const allPicked = computed(() => rows.value.length > 0 && rows.value.every((user) => picked.value.includes(user.id)))

let debounce = null
let latest = 0
async function load() {
  const ticket = (latest += 1)
  loading.value = true
  try {
    const items = await projectsApi.candidates({ search: search.value, limit: 100 })
    if (ticket === latest) candidates.value = items
  } catch (error) {
    if (ticket === latest) toast.error(apiErrorText(error))
  } finally {
    if (ticket === latest) loading.value = false
  }
}
function onSearch(value) {
  search.value = value
  clearTimeout(debounce)
  debounce = setTimeout(load, 250)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    picked.value = []
    search.value = ''
    access.value = 'EDIT'
    load()
  },
  { immediate: true },
)

function toggleAll() {
  picked.value = allPicked.value ? [] : rows.value.map((user) => user.id)
}

async function submit() {
  if (!picked.value.length) return
  submitting.value = true
  try {
    const project = await projectsApi.addMembers(props.project.id, picked.value, access.value)
    toast.success(t('projects.members.added', { n: picked.value.length }))
    emit('added', project)
    emit('update:modelValue', false)
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="t('projects.members.addTitle')" size="lg" @update:model-value="$emit('update:modelValue', $event)">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <p class="max-w-[300px] text-[15px] leading-snug text-ink">{{ t('projects.members.addHint') }}</p>
      <div class="w-48">
        <AppSelect
          v-model="access"
          :aria-label="t('projects.access.label')"
          :options="[
            { value: 'VIEW', label: t('projects.access.VIEW') },
            { value: 'EDIT', label: t('projects.access.EDIT') },
          ]"
        />
      </div>
    </div>

    <div class="mt-5 flex items-center gap-3 border-b border-border pb-3">
      <input
        type="checkbox"
        class="h-4 w-4 rounded border-border-strong"
        :checked="allPicked"
        :disabled="!rows.length"
        :aria-label="t('common.all')"
        @change="toggleAll"
      />
      <div class="flex-1">
        <AppInput :model-value="search" icon="search" :placeholder="t('projects.members.search')" @update:model-value="onSearch" />
      </div>
    </div>

    <div v-if="loading && !candidates.length" class="mt-3 space-y-2">
      <Skeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
    </div>
    <ul v-else-if="rows.length" class="mt-1 max-h-[46vh] divide-y divide-border overflow-y-auto">
      <li v-for="user in rows" :key="user.id">
        <label class="flex cursor-pointer items-center gap-4 px-1 py-3 transition-default hover:bg-surface-2">
          <input v-model="picked" type="checkbox" :value="user.id" class="h-4 w-4 rounded border-border-strong" />
          <Avatar :name="user.fullName" :src="user.avatar" size="md" />
          <span class="min-w-0 flex-1">
            <span class="flex flex-wrap items-center gap-2">
              <span class="truncate text-[15px] text-ink">{{ user.fullName }}</span>
              <Badge v-if="user.role && user.role !== 'EMPLOYEE'" variant="success" size="sm">{{ roleLabel(user.role, { t, te }) }}</Badge>
            </span>
            <span class="block truncate text-[13px] text-ink-muted">{{ user.email || user.position }}</span>
          </span>
        </label>
      </li>
    </ul>
    <p v-else class="mt-6 text-center text-small text-ink-muted">{{ t('projects.members.nobody') }}</p>

    <template #footer>
      <AppButton variant="secondary" @click="$emit('update:modelValue', false)">{{ t('common.cancel') }}</AppButton>
      <AppButton :disabled="!picked.length" :loading="submitting" @click="submit">{{ t('projects.members.confirm') }}</AppButton>
    </template>
  </Modal>
</template>
