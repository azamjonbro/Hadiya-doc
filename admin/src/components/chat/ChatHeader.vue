<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  conversation: { type: Object, required: true },
  online: { type: Boolean, default: false },
  typing: { type: Boolean, default: false },
  infoOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle-info', 'toggle-search', 'back'])

const { t } = useI18n()

const peer = computed(() => props.conversation.peer ?? {})

// One line, three states, in priority order — "typing" is the most
// informative and must win over presence.
const status = computed(() => {
  if (props.typing) return { text: t('chat.header.typing'), tone: 'text-primary' }
  if (props.online) return { text: t('chat.header.online'), tone: 'text-success' }
  return { text: [peer.value.position, peer.value.department].filter(Boolean).join(' · ') || t('chat.header.offline'), tone: 'text-ink-muted' }
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

    <Avatar :name="peer.fullName ?? '?'" :src="peer.avatar" size="md" :status="online ? 'online' : 'offline'" />

    <div class="min-w-0 flex-1">
      <p class="truncate text-body font-semibold text-ink">{{ peer.fullName ?? '—' }}</p>
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
