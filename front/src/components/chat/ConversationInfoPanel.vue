<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatBytes, formatDateTime, formatRelative } from '@/utils/chatFormat'

// Direct threads only — a group's roster, history and access rules live in
// GroupInfoDialog, which has the room to show them.
const props = defineProps({
  details: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  online: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'preview-image'])

const { t, locale } = useI18n()

const peer = computed(() => props.details?.peer ?? {})

// The identity block: everything the app knows about the person, so the
// reader never has to leave the thread to work out who they are talking to.
const personRows = computed(() => [
  { icon: 'briefcase', label: t('chat.info.position'), value: peer.value.position },
  { icon: 'building', label: t('chat.info.department'), value: peer.value.department },
  { icon: 'shield', label: t('chat.info.role'), value: peer.value.role },
  { icon: 'user', label: t('chat.info.jshshir'), value: peer.value.jshshir },
  { icon: 'link', label: t('chat.info.email'), value: peer.value.email },
  { icon: 'user-plus', label: t('chat.info.joinedAt'), value: formatDateTime(peer.value.joinedAt, locale.value) },
])

// The thread's own audit trail — this is the "created / updated" data the
// info panel exists to surface, not just a message list.
const threadRows = computed(() =>
  [
    { icon: 'plus', label: t('chat.info.createdAt'), value: formatDateTime(props.details?.createdAt, locale.value) },
    { icon: 'refresh', label: t('chat.info.updatedAt'), value: formatDateTime(props.details?.updatedAt, locale.value) },
    {
      icon: 'message-square',
      label: t('chat.info.lastMessageAt'),
      value: props.details?.lastMessageAt
        ? `${formatDateTime(props.details.lastMessageAt, locale.value)} · ${formatRelative(props.details.lastMessageAt, locale.value, t)}`
        : t('chat.inbox.noMessages'),
    },
    { icon: 'list', label: t('chat.info.messageCount'), value: String(props.details?.messageCount ?? 0) },
    {
      icon: 'check-check',
      label: t('chat.info.peerReadAt'),
      value: props.details?.peerReadAt
        ? formatDateTime(props.details.peerReadAt, locale.value)
        : t('chat.info.notReadYet'),
    },
  ].filter(Boolean)
)

const images = computed(() => (props.details?.attachments ?? []).filter((m) => m.kind === 'IMAGE'))
const files = computed(() => (props.details?.attachments ?? []).filter((m) => m.kind !== 'IMAGE'))
</script>

<template>
  <aside class="flex min-h-0 w-full flex-col border-l border-border bg-surface">
    <div class="flex items-center justify-between border-b border-border px-3 py-2.5">
      <p class="text-small font-semibold text-ink">{{ t('chat.info.title') }}</p>
      <button
        type="button"
        class="rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
        :aria-label="t('chat.info.close')"
        @click="emit('close')"
      >
        <Icon name="close" size="16" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <div v-if="loading" class="space-y-3">
        <Skeleton v-for="i in 7" :key="i" class="h-9 w-full" />
      </div>

      <template v-else-if="details">
        <div class="flex flex-col items-center text-center">
          <Avatar :name="peer.fullName ?? '?'" :src="peer.avatar" size="xl" :status="online ? 'online' : 'offline'" />
          <p class="mt-2.5 text-h3 text-ink">{{ peer.fullName }}</p>
          <p class="mt-0.5 text-small" :class="online ? 'text-success' : 'text-ink-muted'">
            {{ online ? t('chat.header.online') : t('chat.header.offline') }}
          </p>
        </div>

        <p class="mb-2 mt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint">
          {{ t('chat.info.person') }}
        </p>
        <dl class="space-y-1">
          <div v-for="row in personRows" :key="row.label" class="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <Icon :name="row.icon" size="14" class="mt-0.5 shrink-0 text-ink-faint" />
            <dt class="w-24 shrink-0 text-caption text-ink-faint">{{ row.label }}</dt>
            <dd class="min-w-0 flex-1 break-words text-small text-ink">{{ row.value || '—' }}</dd>
          </div>
        </dl>

        <p class="mb-2 mt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint">
          {{ t('chat.info.thread') }}
        </p>
        <dl class="space-y-1">
          <div v-for="row in threadRows" :key="row.label" class="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
            <Icon :name="row.icon" size="14" class="mt-0.5 shrink-0 text-ink-faint" />
            <dt class="w-24 shrink-0 text-caption text-ink-faint">{{ row.label }}</dt>
            <dd class="min-w-0 flex-1 break-words text-small text-ink">{{ row.value || '—' }}</dd>
          </div>
        </dl>

        <template v-if="images.length">
          <p class="mb-2 mt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint">
            {{ t('chat.info.media') }} · {{ images.length }}
          </p>
          <div class="grid grid-cols-3 gap-1.5">
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
        </template>

        <template v-if="files.length">
          <p class="mb-2 mt-5 text-caption font-semibold uppercase tracking-widest text-ink-faint">
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
        </template>
      </template>
    </div>
  </aside>
</template>
