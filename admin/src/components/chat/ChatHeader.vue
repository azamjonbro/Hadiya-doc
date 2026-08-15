<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  conversation: { type: Object, required: true },
  online: { type: Boolean, default: false },
  typing: { type: Boolean, default: false },
  // Who is typing, for a group — a name is the only useful form of the
  // indicator once there can be more than one other person in the room.
  typingName: { type: String, default: '' },
  infoOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle-info', 'toggle-search', 'back'])

const { t } = useI18n()

const peer = computed(() => props.conversation.peer ?? {})
const isGroup = computed(() => Boolean(props.conversation.isGroup))

// One line, three states, in priority order — "typing" is the most
// informative and must win over presence.
const status = computed(() => {
  if (props.typing) {
    const text = isGroup.value && props.typingName
      ? t('chat.header.typingBy', { name: props.typingName })
      : t('chat.header.typing')
    return { text, tone: 'text-primary' }
  }
  if (isGroup.value) {
    return {
      text: t('chat.group.memberCount', { count: props.conversation.memberCount }),
      tone: 'text-ink-muted',
    }
  }
  if (props.online) return { text: t('chat.header.online'), tone: 'text-success' }
  return {
    text: [peer.value.position, peer.value.department].filter(Boolean).join(' · ') || t('chat.header.offline'),
    tone: 'text-ink-muted',
  }
})

</script>

<template>
  <div class="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
    <button
      type="button"
      class="rounded-md p-1.5 text-ink-muted transition-default hover:bg-surface-2 hover:text-ink md:hidden"
      :aria-label="t('common.goBack')"
      @click="emit('back')"
    >
      <Icon name="arrow-left" size="17" />
    </button>

    <span
      v-if="isGroup"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary"
    >
      <Icon name="users" size="17" />
    </span>
    <Avatar v-else :name="peer.fullName ?? '?'" :src="peer.avatar" size="md" :status="online ? 'online' : 'offline'" />

    <div class="min-w-0 flex-1">
      <!-- The name is what a reader points at when they want to know who is
           in the room, so it opens the details rather than jumping straight
           into a rename (which now lives inside that window). -->
      <button
        type="button"
        class="-ml-1 flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-default hover:bg-surface-2"
        :title="isGroup ? t('chat.group.openInfo') : t('chat.header.details')"
        @click="emit('toggle-info')"
      >
        <span class="truncate text-body font-semibold text-ink">
          {{ conversation.title || peer.fullName || '—' }}
        </span>
        <Icon v-if="isGroup" name="chevron-down" size="13" class="shrink-0 text-ink-faint" />
      </button>
      <p class="truncate text-caption" :class="status.tone">{{ status.text }}</p>
    </div>

    <button
      type="button"
      class="rounded-md p-2 text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
      :title="t('chat.header.searchInChat')"
      @click="emit('toggle-search')"
    >
      <Icon name="search" size="17" />
    </button>
    <button
      type="button"
      class="rounded-md p-2 transition-default"
      :class="infoOpen ? 'bg-primary-subtle text-primary' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
      :title="t('chat.header.details')"
      @click="emit('toggle-info')"
    >
      <Icon name="info" size="17" />
    </button>
  </div>
</template>
