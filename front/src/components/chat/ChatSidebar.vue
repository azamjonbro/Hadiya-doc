<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { formatListTime, isNewJoiner } from '@/utils/chatFormat'
import { markdownToPlainText } from '@/utils/markdown'

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  contacts: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  loading: { type: Boolean, default: false },
  contactsLoading: { type: Boolean, default: false },
  online: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select', 'start-with', 'search-contacts'])

const { t, locale } = useI18n()

const tab = ref('chats') // chats | people
const query = ref('')

// Threads filter locally (they are already in memory and few); the
// directory filters server-side, since it can hold every employee.
const filteredConversations = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.conversations
  return props.conversations.filter((conversation) => {
    const peer = conversation.peer
    return (
      peer?.fullName?.toLowerCase().includes(needle) ||
      peer?.department?.toLowerCase().includes(needle) ||
      peer?.position?.toLowerCase().includes(needle) ||
      conversation.lastMessagePreview?.toLowerCase().includes(needle)
    )
  })
})

// Newly created accounts get their own group at the top — the whole point
// of the directory is that someone who has never written can still be
// found, and a new hire is the most likely person to be looked up.
const contactGroups = computed(() =>
  [
    { key: 'new', label: t('chat.inbox.groups.new'), items: props.contacts.filter((c) => isNewJoiner(c.joinedAt)) },
    { key: 'all', label: t('chat.inbox.groups.all'), items: props.contacts.filter((c) => !isNewJoiner(c.joinedAt)) },
  ].filter((group) => group.items.length)
)

let searchTimer = null
watch(query, (value) => {
  if (tab.value !== 'people') return
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => emit('search-contacts', value), 250)
})

watch(tab, (value) => {
  if (value === 'people') emit('search-contacts', query.value)
})

// The preview is markdown source, so it is flattened before it is shown as
// a single line — otherwise `**deadline**` reads as literal asterisks.
function previewFor(conversation) {
  const kindLabel = {
    IMAGE: t('chat.attachment.image'),
    FILE: t('chat.attachment.file'),
    VOICE: t('chat.attachment.voice'),
    SYSTEM: t('chat.system.label.DEFAULT'),
  }[conversation.lastMessageKind]

  const text = markdownToPlainText(conversation.lastMessagePreview)
  if (!text) return kindLabel ?? t('chat.inbox.noMessages')
  return kindLabel && conversation.lastMessageKind !== 'SYSTEM' ? `${kindLabel} · ${text}` : text
}

function subtitleFor(person) {
  return [person.position, person.department].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <!-- Tabs: existing threads vs. the whole colleague directory -->
    <div class="flex gap-1 border-b border-border p-2">
      <button
        v-for="value in ['chats', 'people']"
        :key="value"
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-small font-medium transition-default"
        :class="tab === value ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
        @click="tab = value"
      >
        <Icon :name="value === 'chats' ? 'message-square' : 'users'" size="14" />
        {{ t(`chat.inbox.tabs.${value}`) }}
      </button>
    </div>

    <div class="border-b border-border p-2">
      <div class="relative">
        <Icon name="search" size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          v-model="query"
          type="search"
          :placeholder="tab === 'chats' ? t('chat.inbox.searchChats') : t('chat.inbox.searchPeople')"
          class="h-9 w-full rounded-md border border-border bg-surface-2 pl-8 pr-2.5 text-small text-ink outline-none transition-default placeholder:text-ink-faint focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/15"
        />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Existing conversations -->
      <template v-if="tab === 'chats'">
        <div v-if="loading" class="space-y-2 p-2">
          <Skeleton v-for="i in 6" :key="i" class="h-14 w-full" />
        </div>
        <EmptyState
          v-else-if="!filteredConversations.length"
          icon="message-square"
          :title="query ? t('chat.inbox.noMatches') : t('chat.inbox.empty')"
          :description="query ? '' : t('chat.inbox.emptyHint')"
          class="py-10"
        />
        <button
          v-for="conversation in filteredConversations"
          :key="conversation.id"
          type="button"
          class="flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-default hover:bg-surface-2"
          :class="selectedId === conversation.id ? 'bg-primary-subtle' : ''"
          @click="emit('select', conversation)"
        >
          <Avatar
            :name="conversation.peer?.fullName ?? '?'"
            :src="conversation.peer?.avatar"
            size="md"
            :status="online[conversation.peer?.id] ? 'online' : 'offline'"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2">
              <p class="truncate text-small font-semibold text-ink">{{ conversation.peer?.fullName ?? '—' }}</p>
              <span class="shrink-0 text-caption tabular-nums text-ink-faint">
                {{ formatListTime(conversation.lastMessageAt ?? conversation.createdAt, locale, t) }}
              </span>
            </div>
            <div class="mt-0.5 flex items-center justify-between gap-2">
              <p class="truncate text-caption text-ink-muted">{{ previewFor(conversation) }}</p>
              <span
                v-if="conversation.unreadCount"
                class="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground"
              >
                {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
              </span>
            </div>
          </div>
        </button>
      </template>

      <!-- Full directory: everyone, whether or not a thread exists yet -->
      <template v-else>
        <div v-if="contactsLoading" class="space-y-2 p-2">
          <Skeleton v-for="i in 6" :key="i" class="h-14 w-full" />
        </div>
        <EmptyState v-else-if="!contacts.length" icon="users" :title="t('chat.inbox.noPeople')" class="py-10" />
        <template v-else>
          <div v-for="group in contactGroups" :key="group.key">
            <p class="sticky top-0 z-10 bg-surface/95 px-3 py-1.5 text-caption font-semibold uppercase tracking-widest text-ink-faint backdrop-blur">
              {{ group.label }} · {{ group.items.length }}
            </p>
            <button
                v-for="person in group.items"
                :key="person.id"
                type="button"
                class="flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-default hover:bg-surface-2"
                :class="selectedId && person.conversationId === selectedId ? 'bg-primary-subtle' : ''"
                @click="emit('start-with', person)"
              >
                <Avatar
                  :name="person.fullName"
                  :src="person.avatar"
                  size="md"
                  :status="online[person.id] ? 'online' : 'offline'"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <p class="truncate text-small font-semibold text-ink">{{ person.fullName }}</p>
                    <span
                      v-if="group.key === 'new'"
                      class="shrink-0 rounded-full bg-success-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-success"
                    >
                      {{ t('chat.inbox.newBadge') }}
                    </span>
                  </div>
                  <p class="mt-0.5 truncate text-caption text-ink-muted">
                    {{ subtitleFor(person) || person.role || person.email }}
                  </p>
                </div>
                <span
                  v-if="person.unreadCount"
                  class="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground"
                >
                  {{ person.unreadCount }}
                </span>
                <Icon v-else-if="!person.conversationId" name="plus" size="15" class="shrink-0 text-ink-faint" />
              </button>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
