<script setup>
/**
 * The messages drawer (reference §9): a 620px panel with the conversation
 * list on the left and an empty pane on the right that says "pick
 * someone". Picking a conversation goes to the chat page with it open —
 * the composer, voice notes and attachments live there, and duplicating
 * them in a drawer would be a second chat that can disagree with the first.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import Drawer from '@/components/ui/Drawer.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const { t, locale } = useI18n()
const router = useRouter()
const chat = useChatStore()

const search = ref('')
const conversations = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const list = chat.conversations ?? []
  if (!needle) return list
  return list.filter((c) => nameOf(c).toLowerCase().includes(needle))
})

function nameOf(conversation) {
  return conversation.title || conversation.peer?.fullName || '—'
}

function when(conversation) {
  const at = conversation.lastMessageAt ?? conversation.createdAt
  if (!at) return ''
  const d = new Date(at)
  // Numeric on purpose: Chrome has no month names for `uz` and prints "M09".
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(locale.value, sameYear ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function open(conversation) {
  emit('update:modelValue', false)
  router.push({ path: '/chat', query: { c: conversation.id } })
}

function openAll() {
  emit('update:modelValue', false)
  router.push('/chat')
}
</script>

<template>
  <Drawer :model-value="props.modelValue" :title="t('portal.topbar.messages')" width="max-w-[620px]" @update:model-value="emit('update:modelValue', $event)">
    <div class="-mx-6 -my-5 flex h-full min-h-[70vh]">
      <div class="flex w-[230px] shrink-0 flex-col border-r border-border">
        <div class="flex items-center gap-2 p-3">
          <label class="relative flex-1">
            <Icon name="search" size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              v-model="search"
              type="search"
              class="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-caption text-ink outline-none transition-default placeholder:text-ink-faint focus:border-primary"
              :placeholder="t('portal.chat.search')"
            />
          </label>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
            :aria-label="t('portal.chat.new')"
            @click="openAll"
          >
            <Icon name="plus" size="16" />
          </button>
        </div>

        <ul class="flex-1 overflow-y-auto">
          <li v-for="c in conversations" :key="c.id">
            <button type="button" class="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-default hover:bg-surface-2" @click="open(c)">
              <Avatar :name="nameOf(c)" :src="c.peer?.avatar" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2">
                  <span class="truncate text-[13px] font-semibold uppercase text-ink">{{ nameOf(c) }}</span>
                  <span class="shrink-0 text-[11px] text-ink-faint">{{ when(c) }}</span>
                </span>
                <span class="mt-0.5 block truncate text-caption" :class="c.unreadCount > 0 ? 'font-medium text-ink' : 'text-ink-muted'">
                  {{ c.lastMessagePreview || t('portal.chat.noMessages') }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <div class="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <Icon name="message-square" size="56" class="mb-4 text-ink-faint opacity-40" />
        <p class="text-small text-ink-muted">
          {{ t('portal.chat.pick') }}
          <button type="button" class="text-primary underline-offset-2 hover:underline" @click="openAll">{{ t('portal.chat.pickLink') }}</button>
        </p>
      </div>
    </div>
  </Drawer>
</template>
