<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { chatApi } from '@/services/chat'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // The colleague directory, already loaded by the workspace.
  contacts: { type: Array, default: () => [] },
  // The parent owns the request, so it owns its pending and error state —
  // the dialog only closes once the group actually exists.
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'create'])

const { t } = useI18n()

const title = ref('')
const search = ref('')
const selectedIds = ref([])
const sourceGroups = ref([])
const sourceGroupsLoaded = ref(false)

const contactById = computed(() => new Map(props.contacts.map((c) => [c.id, c])))

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return props.contacts
  return props.contacts.filter((c) =>
    [c.fullName, c.department, c.position, c.username].some((v) => v?.toLowerCase().includes(needle))
  )
})

const selectedPeople = computed(() => selectedIds.value.map((id) => contactById.value.get(id)).filter(Boolean))

const canSubmit = computed(() => Boolean(title.value.trim()) && selectedIds.value.length > 0 && !props.submitting)

function toggle(id) {
  const index = selectedIds.value.indexOf(id)
  if (index === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(index, 1)
}

// Seeds the roster from an org group ("Sotuv jamoasi") — a one-time copy,
// not a link: the two rosters drift apart afterwards on purpose, so adding
// somebody to the team later does not silently put them in an old thread.
function fillFrom(group) {
  const known = group.memberIds.filter((id) => contactById.value.has(id))
  selectedIds.value = [...new Set([...selectedIds.value, ...known])]
  if (!title.value.trim()) title.value = group.name
}

// Loaded lazily and only once — most groups are created from scratch, and
// the endpoint is permission-gated so a plain member would just get a 403.
async function loadSourceGroups() {
  if (sourceGroupsLoaded.value) return
  sourceGroupsLoaded.value = true
  try {
    sourceGroups.value = await chatApi.listSourceGroups()
  } catch {
    sourceGroups.value = []
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    title.value = ''
    search.value = ''
    selectedIds.value = []
    loadSourceGroups()
  }
)

function submit() {
  if (!canSubmit.value) return
  emit('create', { title: title.value.trim(), memberIds: [...selectedIds.value] })
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    size="lg"
    :title="t('chat.group.createTitle')"
    :description="t('chat.group.createHint')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="space-y-4">
      <AppInput v-model="title" :label="t('chat.group.name')" :placeholder="t('chat.group.namePlaceholder')" icon="users" />

      <div v-if="sourceGroups.length">
        <p class="mb-1.5 text-caption font-semibold uppercase tracking-widest text-ink-faint">
          {{ t('chat.group.fromExisting') }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="group in sourceGroups"
            :key="group.id"
            type="button"
            class="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-caption text-ink-muted transition-default hover:border-primary hover:text-primary"
            @click="fillFrom(group)"
          >
            <Icon name="plus" size="12" />
            {{ group.name }}
            <span class="text-ink-faint">· {{ group.memberCount }}</span>
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">
            {{ t('chat.group.members') }}
          </p>
          <span class="text-caption text-ink-faint">{{ t('chat.group.selected', { count: selectedIds.length }) }}</span>
        </div>

        <div v-if="selectedPeople.length" class="mb-2 flex flex-wrap gap-1.5">
          <span
            v-for="person in selectedPeople"
            :key="person.id"
            class="flex items-center gap-1.5 rounded-full bg-primary-subtle px-2 py-1 text-caption text-primary"
          >
            {{ person.fullName }}
            <button type="button" :aria-label="t('common.remove')" @click="toggle(person.id)">
              <Icon name="close" size="11" />
            </button>
          </span>
        </div>

        <AppInput v-model="search" icon="search" :placeholder="t('chat.inbox.searchPeople')" />

        <div class="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
          <p v-if="!filtered.length" class="px-3 py-4 text-center text-caption text-ink-faint">
            {{ t('chat.inbox.noPeople') }}
          </p>
          <button
            v-for="person in filtered"
            :key="person.id"
            type="button"
            class="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left transition-default last:border-b-0 hover:bg-surface-2"
            :class="selectedIds.includes(person.id) ? 'bg-primary-subtle' : ''"
            @click="toggle(person.id)"
          >
            <Avatar :name="person.fullName" :src="person.avatar" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-small font-medium text-ink">{{ person.fullName }}</span>
              <span class="block truncate text-caption text-ink-faint">
                {{ [person.position, person.department].filter(Boolean).join(' · ') || person.role }}
              </span>
            </span>
            <Icon
              :name="selectedIds.includes(person.id) ? 'check-square' : 'plus'"
              size="15"
              :class="selectedIds.includes(person.id) ? 'text-primary' : 'text-ink-faint'"
            />
          </button>
        </div>
      </div>

      <p v-if="error" class="text-small text-danger">{{ error }}</p>
    </div>

    <template #footer>
      <AppButton variant="ghost" @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</AppButton>
      <AppButton :disabled="!canSubmit" :loading="submitting" @click="submit">{{ t('chat.group.create') }}</AppButton>
    </template>
  </Modal>
</template>
