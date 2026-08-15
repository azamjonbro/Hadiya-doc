<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import MarkdownBody from './MarkdownBody.vue'
import VoicePlayer from './VoicePlayer.vue'
import { formatBytes, formatClock, formatDateTime } from '@/utils/chatFormat'

const props = defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  // Whether the peer has read up to this message — drives the double tick.
  // Null in a group, where "read" is a different state per member.
  peerReadAt: { type: [String, Date], default: null },
  senderName: { type: String, default: '' },
  // In a group every incoming bubble is labelled with its author, and
  // consecutive messages from the same person only label the first.
  showSender: { type: Boolean, default: false },
  inGroup: { type: Boolean, default: false },
})

const emit = defineEmits(['edit', 'delete', 'preview-image'])

const { t, locale } = useI18n()

const editing = ref(false)
const draft = ref('')

const attachment = computed(() => props.message.attachment)
const isDeleted = computed(() => Boolean(props.message.deletedAt))
const isSystem = computed(() => props.message.kind === 'SYSTEM')

const readByPeer = computed(() => {
  if (!props.mine || !props.peerReadAt) return false
  return new Date(props.peerReadAt) >= new Date(props.message.createdAt)
})

// Full timestamp on hover; the visible label stays a bare clock so the
// bubble does not turn into a wall of metadata.
const timestampTitle = computed(() => {
  const created = formatDateTime(props.message.createdAt, locale.value)
  if (!props.message.editedAt) return created
  return `${created} · ${t('chat.message.editedAt', { value: formatDateTime(props.message.editedAt, locale.value) })}`
})

// Unknown future events must not render a raw i18n key at the user, so
// both lookups fall back to something readable.
const KNOWN_SYSTEM_EVENTS = new Set([
  'TASK_ASSIGNED',
  'TASK_COMPLETED',
  'TASK_STATUS_CHANGED',
  'GROUP_CREATED',
  'GROUP_RENAMED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_LEFT',
])

// Group roster events are the thread's audit trail, so they get their own
// icon — a task card and "X added Y to the group" are different kinds of
// event and reading them as one blurs both.
const GROUP_EVENT_ICONS = {
  GROUP_CREATED: 'users',
  GROUP_RENAMED: 'pencil',
  MEMBER_ADDED: 'user-plus',
  MEMBER_REMOVED: 'close',
  MEMBER_LEFT: 'arrow-left',
}

const systemEvent = computed(() =>
  KNOWN_SYSTEM_EVENTS.has(props.message.system?.event) ? props.message.system.event : 'DEFAULT'
)

const systemIcon = computed(() => GROUP_EVENT_ICONS[systemEvent.value] ?? 'check-square')

const systemHeading = computed(() => t(`chat.system.label.${systemEvent.value}`))

const systemLabel = computed(() => {
  const system = props.message.system
  if (!system) return ''
  return t(`chat.system.text.${systemEvent.value}`, {
    title: system.params?.title ?? '',
    // The message carries its own author, so a roster event stays
    // attributable even after that person has left the group.
    actor: props.message.sender?.fullName ?? props.senderName,
    // The person the event happened *to*, which is not the author.
    member: system.params?.name ?? '',
    previousTitle: system.params?.previousTitle ?? '',
    name: props.senderName,
    status: system.params?.status ?? '',
  })
})

const systemDeadline = computed(() => {
  const raw = props.message.system?.params?.deadline
  return raw ? formatDateTime(raw, locale.value) : ''
})

function startEdit() {
  draft.value = props.message.body
  editing.value = true
}

function confirmEdit() {
  const body = draft.value.trim()
  editing.value = false
  if (body && body !== props.message.body) emit('edit', props.message.id, body)
}
</script>

<template>
  <!-- System events are the app talking, not a person, so they render as a
       centred card rather than as either side's bubble. -->
  <div v-if="isSystem" class="flex justify-center py-1">
    <div class="flex max-w-[85%] items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
      <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Icon :name="systemIcon" size="13" />
      </span>
      <div class="min-w-0">
        <p class="text-caption font-semibold uppercase tracking-wide text-ink-faint">{{ systemHeading }}</p>
        <p class="mt-0.5 text-small text-ink">{{ systemLabel }}</p>
        <p v-if="systemDeadline" class="mt-1 flex items-center gap-1.5 text-caption text-ink-muted">
          <Icon name="clock" size="12" />
          {{ systemDeadline }}
        </p>
        <p class="mt-1 text-caption text-ink-faint">{{ formatClock(message.createdAt, locale) }}</p>
      </div>
    </div>
  </div>

  <div v-else class="group flex items-end gap-1.5" :class="mine ? 'justify-end' : 'justify-start'">
    <!-- Actions sit outside the bubble so they never overlap its content,
         and are keyboard reachable rather than hover-only. -->
    <div
      v-if="mine && !isDeleted && !editing"
      class="flex gap-0.5 opacity-0 transition-default focus-within:opacity-100 group-hover:opacity-100"
    >
      <button
        v-if="message.kind === 'TEXT'"
        type="button"
        class="rounded p-1 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
        :title="t('chat.actions.edit')"
        @click="startEdit"
      >
        <Icon name="pencil" size="13" />
      </button>
      <button
        type="button"
        class="rounded p-1 text-ink-faint transition-default hover:bg-danger-subtle hover:text-danger"
        :title="t('chat.actions.delete')"
        @click="emit('delete', message.id)"
      >
        <Icon name="trash" size="13" />
      </button>
    </div>

    <!-- Group author: the avatar sits beside the bubble and only on the
         first message of a run, with a spacer keeping the rest of the run
         flush with it rather than stepping in and out. -->
    <template v-if="inGroup && !mine">
      <Avatar
        v-if="showSender"
        :name="message.sender?.fullName ?? '?'"
        :src="message.sender?.avatar"
        size="xs"
        class="shrink-0"
      />
      <span v-else class="w-6 shrink-0" aria-hidden="true" />
    </template>

    <div
      class="max-w-[min(32rem,78%)] rounded-2xl px-3.5 py-2.5 text-small shadow-sm"
      :class="[
        mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-surface-2 text-ink',
        isDeleted ? 'opacity-70' : '',
      ]"
    >
      <p v-if="inGroup && !mine && showSender" class="mb-1 truncate text-caption font-semibold text-primary">
        {{ message.sender?.fullName ?? senderName }}
      </p>

      <p v-if="isDeleted" class="flex items-center gap-1.5 italic opacity-80">
        <Icon name="trash" size="13" />
        {{ t('chat.message.deleted') }}
      </p>

      <template v-else>
        <!-- Image: rendered inline at its natural ratio, click to open full
             size. The stored width/height reserve the space so the thread
             does not jump as images decode. -->
        <button
          v-if="message.kind === 'IMAGE' && attachment"
          type="button"
          class="mb-1.5 block overflow-hidden rounded-lg"
          @click="emit('preview-image', attachment)"
        >
          <img
            :src="attachment.url"
            :alt="attachment.originalFilename"
            class="max-h-72 min-w-[8rem] max-w-sm object-cover"
            :style="attachment.width && attachment.height ? { aspectRatio: `${attachment.width} / ${attachment.height}` } : {}"
            loading="lazy"
          />
        </button>

        <VoicePlayer
          v-else-if="message.kind === 'VOICE' && attachment"
          class="mb-1"
          :src="attachment.url"
          :duration-sec="attachment.durationSec"
          :tone="mine ? 'onPrimary' : 'neutral'"
        />

        <a
          v-else-if="message.kind === 'FILE' && attachment"
          :href="attachment.url"
          target="_blank"
          rel="noopener noreferrer"
          class="mb-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-default"
          :class="mine ? 'bg-white/15 hover:bg-white/25' : 'bg-surface hover:bg-surface-3'"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
            :class="mine ? 'bg-white/20' : 'bg-primary-subtle text-primary'"
          >
            <Icon name="file-text" size="16" />
          </span>
          <span class="min-w-0">
            <span class="block max-w-[14rem] truncate font-medium">{{ attachment.originalFilename || t('chat.attachment.file') }}</span>
            <span class="block text-caption" :class="mine ? 'text-primary-foreground/70' : 'text-ink-faint'">
              {{ formatBytes(attachment.size) }} · {{ t('chat.attachment.download') }}
            </span>
          </span>
          <Icon name="download" size="15" class="ml-auto shrink-0" />
        </a>

        <div v-if="editing" class="min-w-[14rem]">
          <textarea
            v-model="draft"
            rows="2"
            class="w-full resize-none rounded-md border border-white/30 bg-black/10 px-2 py-1.5 text-small outline-none"
            @keydown.enter.exact.prevent="confirmEdit"
            @keydown.esc="editing = false"
          />
          <div class="mt-1 flex justify-end gap-2 text-caption">
            <button type="button" class="opacity-80 hover:opacity-100" @click="editing = false">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="font-semibold" @click="confirmEdit">{{ t('common.save') }}</button>
          </div>
        </div>
        <MarkdownBody v-else-if="message.body" :source="message.body" />
      </template>

      <div
        class="mt-1 flex items-center justify-end gap-1 text-caption"
        :class="mine ? 'text-primary-foreground/70' : 'text-ink-faint'"
      >
        <span v-if="message.editedAt && !isDeleted">{{ t('chat.message.edited') }}</span>
        <span :title="timestampTitle" class="tabular-nums">{{ formatClock(message.createdAt, locale) }}</span>
        <Icon v-if="mine" :name="readByPeer ? 'check-check' : 'check'" size="13" :class="readByPeer ? 'opacity-100' : 'opacity-70'" />
      </div>
    </div>
  </div>
</template>
