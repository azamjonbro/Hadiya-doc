<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Modal from '@/components/ui/Modal.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatBytes, formatDateTime, formatRelative } from '@/utils/chatFormat'

// A group's details open as a window rather than the side panel a DM uses:
// the roster is the thing you came to read, it is editable, and it needs
// more room than a 20rem column beside the thread.
const props = defineProps({
  open: { type: Boolean, default: false },
  details: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  onlineMap: { type: Object, default: () => ({}) },
  canManageGroups: { type: Boolean, default: false },
  myId: { type: String, default: '' },
  contacts: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'rename', 'add-members', 'remove-member', 'leave-group', 'preview-image'])

const { t, locale } = useI18n()

const members = computed(() => props.details?.members ?? [])

// Three things a reader comes here for, and they do not fit one scroll: who
// is in the room (and editing that), what the room has been doing, and who is
// allowed to change it.
const TABS = ['members', 'history', 'security']
const activeTab = ref('members')

// The creator is resolved from the roster — once they have left the group
// there is no name to show, and an id would mean nothing to a reader.
const creatorName = computed(() => {
  const id = props.details?.createdBy
  if (!id) return ''
  return members.value.find((m) => m.id === id)?.fullName ?? ''
})

const renaming = ref(false)
const draft = ref('')
const nameInput = ref(null)

const adding = ref(false)
const memberSearch = ref('')

// Only people who are not already in the room, so the picker never offers a
// no-op the server would reject as ALREADY_MEMBERS.
const addable = computed(() => {
  const current = new Set(members.value.map((m) => m.id))
  const needle = memberSearch.value.trim().toLowerCase()
  return props.contacts
    .filter((c) => !current.has(c.id))
    .filter((c) => !needle || c.fullName?.toLowerCase().includes(needle) || c.department?.toLowerCase().includes(needle))
    .slice(0, 20)
})

const threadRows = computed(() => [
  { icon: 'plus', label: t('chat.info.createdAt'), value: formatDateTime(props.details?.createdAt, locale.value) },
  {
    icon: 'message-square',
    label: t('chat.info.lastMessageAt'),
    value: props.details?.lastMessageAt
      ? `${formatDateTime(props.details.lastMessageAt, locale.value)} · ${formatRelative(props.details.lastMessageAt, locale.value, t)}`
      : t('chat.inbox.noMessages'),
  },
  { icon: 'list', label: t('chat.info.messageCount'), value: String(props.details?.messageCount ?? 0) },
])

const images = computed(() => (props.details?.attachments ?? []).filter((m) => m.kind === 'IMAGE'))
const files = computed(() => (props.details?.attachments ?? []).filter((m) => m.kind !== 'IMAGE'))

// Reopening must not resume a half-finished edit from last time.
watch(
  () => props.open,
  (open) => {
    if (open) {
      activeTab.value = 'members'
      return
    }
    renaming.value = false
    adding.value = false
    memberSearch.value = ''
  }
)

async function startRename() {
  if (!props.canManageGroups) return
  draft.value = props.details?.title ?? ''
  renaming.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

// Enter commits and unmounts the input, which fires `blur` on the way out —
// so without this guard a rename lands twice, writing two identical
// "renamed the group" events into the thread.
function confirmRename() {
  if (!renaming.value) return
  const title = draft.value.trim()
  renaming.value = false
  if (title && title !== props.details?.title) emit('rename', title)
}

function addMember(person) {
  emit('add-members', [person.id])
  memberSearch.value = ''
}
</script>

<template>
  <Modal
    :model-value="open"
    size="lg"
    :title="t('chat.group.openInfo')"
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="loading" class="space-y-3">
      <Skeleton v-for="i in 6" :key="i" class="h-10 w-full" />
    </div>

    <div v-else-if="details" class="space-y-5">
      <!-- Identity: the name is edited in place, since it is the thing the
           reader clicked to get here. -->
      <div class="flex flex-col items-center text-center">
        <span class="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary">
          <Icon name="users" size="26" />
        </span>

        <input
          v-if="renaming"
          ref="nameInput"
          v-model="draft"
          type="text"
          maxlength="120"
          class="mt-2.5 w-full max-w-sm rounded-md border border-primary bg-surface px-2.5 py-1.5 text-center text-h3 text-ink outline-none focus:ring-2 focus:ring-primary/15"
          @keydown.enter.prevent="confirmRename"
          @keydown.esc="renaming = false"
          @blur="confirmRename"
        />
        <button
          v-else-if="canManageGroups"
          type="button"
          class="mt-2.5 flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 transition-default hover:bg-surface-2"
          :title="t('chat.group.renameHint')"
          @click="startRename"
        >
          <span class="truncate text-h3 text-ink">{{ details.title }}</span>
          <Icon name="pencil" size="14" class="shrink-0 text-ink-faint" />
        </button>
        <p v-else class="mt-2.5 text-h3 text-ink">{{ details.title }}</p>

        <p class="mt-0.5 text-small text-ink-muted">
          {{ t('chat.group.memberCount', { count: details.memberCount }) }}
        </p>
      </div>

      <nav class="flex gap-1 border-b border-border">
        <button
          v-for="tab in TABS"
          :key="tab"
          type="button"
          class="-mb-px border-b-2 px-3 py-2 text-small font-medium transition-default"
          :class="activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'"
          @click="activeTab = tab"
        >
          {{ t(`chat.group.tabs.${tab}`) }}
        </button>
      </nav>

      <!-- Members -->
      <div v-if="activeTab === 'members'">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-caption font-semibold uppercase tracking-widest text-ink-faint">
            {{ t('chat.group.members') }} · {{ members.length }}
          </p>
          <button
            v-if="canManageGroups"
            type="button"
            class="flex items-center gap-1 rounded-md px-1.5 py-1 text-caption font-medium text-primary transition-default hover:bg-primary-subtle"
            @click="adding = !adding"
          >
            <Icon :name="adding ? 'close' : 'user-plus'" size="13" />
            {{ adding ? t('common.cancel') : t('chat.group.addMember') }}
          </button>
        </div>

        <div v-if="adding" class="mb-2 rounded-md border border-border p-2">
          <input
            v-model="memberSearch"
            type="search"
            :placeholder="t('chat.inbox.searchPeople')"
            class="h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-small text-ink outline-none focus:border-primary"
          />
          <div class="mt-1.5 max-h-44 overflow-y-auto">
            <p v-if="!addable.length" class="py-2 text-center text-caption text-ink-faint">
              {{ t('chat.group.everyoneAdded') }}
            </p>
            <button
              v-for="person in addable"
              :key="person.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-default hover:bg-surface-2"
              @click="addMember(person)"
            >
              <Avatar :name="person.fullName" :src="person.avatar" size="xs" />
              <span class="min-w-0 flex-1 truncate text-small text-ink">{{ person.fullName }}</span>
              <Icon name="plus" size="13" class="shrink-0 text-primary" />
            </button>
          </div>
        </div>

        <div class="max-h-64 overflow-y-auto">
          <div
            v-for="member in members"
            :key="member.id"
            class="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2"
          >
            <Avatar
              :name="member.fullName"
              :src="member.avatar"
              size="sm"
              :status="onlineMap[member.id] ? 'online' : 'offline'"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-small text-ink">
                {{ member.fullName }}
                <span v-if="member.id === myId" class="text-caption text-ink-faint">· {{ t('chat.group.you') }}</span>
              </p>
              <p class="truncate text-caption text-ink-faint">
                {{ [member.position, member.department].filter(Boolean).join(' · ') || member.role }}
              </p>
            </div>
            <button
              v-if="canManageGroups && member.id !== myId"
              type="button"
              class="rounded p-1 text-ink-faint opacity-0 transition-default focus:opacity-100 group-hover:opacity-100 hover:bg-danger-subtle hover:text-danger"
              :title="t('chat.group.removeMember')"
              @click="emit('remove-member', member.id)"
            >
              <Icon name="close" size="13" />
            </button>
          </div>
        </div>
      </div>

      <!-- Thread facts -->
      <div v-else-if="activeTab === 'history'">
        <p class="mb-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
          {{ t('chat.info.thread') }}
        </p>
        <dl class="space-y-1">
          <div v-for="row in threadRows" :key="row.label" class="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <Icon :name="row.icon" size="14" class="mt-0.5 shrink-0 text-ink-faint" />
            <dt class="w-32 shrink-0 text-caption text-ink-faint">{{ row.label }}</dt>
            <dd class="min-w-0 flex-1 break-words text-small text-ink">{{ row.value || '—' }}</dd>
          </div>
        </dl>
      </div>

      <template v-if="activeTab === 'history' && images.length">
        <div>
          <p class="mb-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
            {{ t('chat.info.media') }} · {{ images.length }}
          </p>
          <div class="grid grid-cols-6 gap-1.5">
            <button
              v-for="message in images"
              :key="message.id"
              type="button"
              class="aspect-square overflow-hidden rounded-md"
              @click="emit('preview-image', message.attachment)"
            >
              <img :src="message.attachment.url" alt="" class="h-full w-full object-cover" loading="lazy" />
            </button>
          </div>
        </div>
      </template>

      <template v-if="activeTab === 'history' && files.length">
        <div>
          <p class="mb-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">
            {{ t('chat.info.files') }} · {{ files.length }}
          </p>
          <a
            v-for="message in files"
            :key="message.id"
            :href="message.attachment.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mb-1 flex items-center gap-2.5 rounded-md px-2 py-2 transition-default hover:bg-surface-2"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Icon :name="message.kind === 'VOICE' ? 'mic' : 'file-text'" size="14" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-small text-ink">
                {{ message.attachment.originalFilename || t('chat.attachment.voice') }}
              </span>
              <span class="block text-caption text-ink-faint">
                {{ formatBytes(message.attachment.size) }} · {{ formatDateTime(message.createdAt, locale) }}
              </span>
            </span>
            <Icon name="download" size="14" class="shrink-0 text-ink-faint" />
          </a>
        </div>
      </template>

      <p
        v-if="activeTab === 'history' && !images.length && !files.length"
        class="text-caption text-ink-faint"
      >
        {{ t('chat.group.noAttachments') }}
      </p>

      <!-- Who may change this room, and what gets written down when they do -->
      <div v-if="activeTab === 'security'">
        <dl class="space-y-1">
          <div class="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <Icon name="user" size="14" class="mt-0.5 shrink-0 text-ink-faint" />
            <dt class="w-32 shrink-0 text-caption text-ink-faint">{{ t('chat.group.owner') }}</dt>
            <dd class="min-w-0 flex-1 break-words text-small text-ink">
              {{ creatorName || t('chat.group.ownerLeft') }}
            </dd>
          </div>
          <div class="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <Icon name="shield" size="14" class="mt-0.5 shrink-0 text-ink-faint" />
            <dt class="w-32 shrink-0 text-caption text-ink-faint">{{ t('chat.group.yourAccess') }}</dt>
            <dd class="min-w-0 flex-1 break-words text-small text-ink">
              {{ canManageGroups ? t('chat.group.accessManager') : t('chat.group.accessMember') }}
            </dd>
          </div>
        </dl>

        <p class="mt-3 rounded-lg bg-surface-2 px-3 py-2.5 text-caption text-ink-muted">
          {{ t('chat.group.manageRule') }}
        </p>
        <p class="mt-2 rounded-lg bg-surface-2 px-3 py-2.5 text-caption text-ink-muted">
          {{ t('chat.group.auditRule') }}
        </p>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border border-danger/30 px-3 py-2 text-small font-medium text-danger transition-default hover:bg-danger-subtle"
        @click="emit('leave-group')"
      >
        <Icon name="arrow-left" size="14" />
        {{ t('chat.group.leave') }}
      </button>
    </template>
  </Modal>
</template>
