<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { chatApi } from '@/services/chat'
import { useToast } from '@/composables/useToast'
import AppCard from '@/components/ui/AppCard.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import ChatSidebar from './ChatSidebar.vue'
import ChatHeader from './ChatHeader.vue'
import MessageBubble from './MessageBubble.vue'
import MessageComposer from './MessageComposer.vue'
import ConversationInfoPanel from './ConversationInfoPanel.vue'
import { formatDayLabel, formatClock } from '@/utils/chatFormat'
import { markdownToPlainText } from '@/utils/markdown'

const { t, locale } = useI18n()
const auth = useAuthStore()
const chat = useChatStore()
const toast = useToast()

const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const scrollEl = ref(null)
const composer = ref(null)

const infoOpen = ref(false)
const details = ref(null)
const detailsLoading = ref(false)

const searchOpen = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const searching = ref(false)

const lightbox = ref(null)

// Re-evaluated on a timer so the peer's "typing…" expires on its own —
// see TYPING_TTL_MS in stores/chat.js.
const typingTick = ref(0)
let typingTimer = null

const selected = computed(() => chat.selected)
const peerTyping = computed(() => {
  typingTick.value
  return selected.value ? chat.peerTyping(selected.value.id) : false
})
const peerOnline = computed(() => Boolean(selected.value?.peer && chat.isOnline(selected.value.peer.id)))

// Messages grouped under a day heading, so a long thread stays navigable
// without every bubble repeating its date.
const grouped = computed(() => {
  const groups = []
  for (const message of chat.messages) {
    const day = new Date(message.createdAt).toDateString()
    const last = groups[groups.length - 1]
    if (last?.day === day) last.messages.push(message)
    else groups.push({ day, at: message.createdAt, messages: [message] })
  }
  return groups
})

async function scrollToBottom(behavior = 'auto') {
  await nextTick()
  const element = scrollEl.value
  if (element) element.scrollTo({ top: element.scrollHeight, behavior })
}

// Paging backwards must not yank the reader to a new position, so the
// scroll offset is restored relative to the height added above it.
async function onScroll() {
  const element = scrollEl.value
  if (!element || element.scrollTop > 60 || !chat.olderCursor || chat.loadingOlder) return
  const previousHeight = element.scrollHeight
  await chat.loadOlder()
  await nextTick()
  element.scrollTop = element.scrollHeight - previousHeight
}

async function load() {
  loading.value = true
  try {
    if (!chat.initialized) await chat.init(auth.accessToken, auth.user?.id)
    else await chat.loadConversations()
    await chat.loadContacts()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function openConversation(conversation) {
  errorMessage.value = ''
  searchOpen.value = false
  try {
    await chat.openConversation(conversation.id)
    await scrollToBottom()
    composer.value?.focus()
    if (infoOpen.value) await loadDetails()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

async function startWith(person) {
  errorMessage.value = ''
  try {
    await chat.openWith(person.id)
    await scrollToBottom()
    composer.value?.focus()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  }
}

// Attachments upload first and are referenced by key when the message is
// sent — see chat.routes.js for why the two steps are separate.
async function onSend({ body, kind, file, durationSec = 0 }) {
  if (sending.value) return
  sending.value = true
  errorMessage.value = ''
  try {
    let attachment = null
    if (file) {
      const uploaded = await chat.uploadAttachment({ file, kind })
      attachment = { ...uploaded, durationSec }
      if (kind === 'IMAGE') {
        const size = await readImageSize(file)
        attachment.width = size.width
        attachment.height = size.height
      }
    }
    await chat.send({ body, kind, attachment })
    await scrollToBottom('smooth')
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    sending.value = false
  }
}

// Sent with the message so the bubble can reserve the right aspect ratio
// before the image has decoded.
function readImageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    image.src = url
  })
}

async function onEdit(messageId, body) {
  try {
    await chat.edit(messageId, body)
  } catch (error) {
    toast.error(error.response?.data?.message ?? String(error))
  }
}

async function onDelete(messageId) {
  try {
    await chat.remove(messageId)
  } catch (error) {
    toast.error(error.response?.data?.message ?? String(error))
  }
}

async function loadDetails() {
  if (!selected.value) return
  detailsLoading.value = true
  try {
    details.value = await chatApi.getDetails(selected.value.id)
  } finally {
    detailsLoading.value = false
  }
}

async function toggleInfo() {
  infoOpen.value = !infoOpen.value
  if (infoOpen.value) await loadDetails()
}

let searchTimer = null
watch(searchQuery, (value) => {
  clearTimeout(searchTimer)
  if (!value.trim()) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      searchResults.value = await chatApi.search({ q: value, conversationId: selected.value?.id })
    } finally {
      searching.value = false
    }
  }, 300)
})

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) {
    searchQuery.value = ''
    searchResults.value = []
  }
}

// New messages only pull the view down when the reader is already at the
// bottom — otherwise an incoming message would interrupt someone reading
// back through history.
watch(
  () => chat.messages.length,
  async () => {
    const element = scrollEl.value
    if (!element) return
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 160
    if (atBottom) await scrollToBottom('smooth')
  }
)

onMounted(() => {
  load()
  typingTimer = setInterval(() => {
    typingTick.value += 1
  }, 1000)
})

onBeforeUnmount(() => clearInterval(typingTimer))
</script>

<template>
  <div class="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-[100rem] flex-col px-3 py-4 sm:px-6 sm:py-6">
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-h1 text-ink">{{ t('chat.title') }}</h1>
      <p class="text-caption text-ink-muted">
        {{ t('chat.summary', { chats: chat.conversations.length, people: chat.contacts.length }) }}
      </p>
    </div>

    <div
      class="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3"
      :class="infoOpen ? 'md:grid-cols-[19rem_1fr_20rem]' : 'md:grid-cols-[19rem_1fr]'"
    >
      <!-- On a phone the list and the thread share one column: the list is
           the page until a thread is opened, and the header's back button
           returns to it. From md up both are visible side by side. -->
      <AppCard
        padding="none"
        class="min-h-0 flex-col overflow-hidden"
        :class="selected ? 'hidden md:flex' : 'flex'"
      >
        <ChatSidebar
          :conversations="chat.conversations"
          :contacts="chat.contacts"
          :selected-id="chat.selectedId"
          :loading="loading"
          :contacts-loading="chat.contactsLoading"
          :online="chat.online"
          @select="openConversation"
          @start-with="startWith"
          @search-contacts="chat.loadContacts"
        />
      </AppCard>

      <AppCard padding="none" class="flex min-h-0 flex-col overflow-hidden" :class="selected ? '' : 'hidden md:flex'">
        <template v-if="selected">
          <ChatHeader
            :conversation="selected"
            :online="peerOnline"
            :typing="peerTyping"
            :info-open="infoOpen"
            @toggle-info="toggleInfo"
            @toggle-search="toggleSearch"
            @back="chat.selectedId = null"
          />

          <div v-if="searchOpen" class="border-b border-border bg-surface-2 p-2.5">
            <div class="relative">
              <Icon name="search" size="15" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                v-model="searchQuery"
                type="search"
                autofocus
                :placeholder="t('chat.header.searchPlaceholder')"
                class="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-2.5 text-small text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div v-if="searchQuery.trim()" class="mt-2 max-h-56 space-y-1 overflow-y-auto">
              <p v-if="searching" class="px-1 text-caption text-ink-faint">{{ t('common.loading') }}</p>
              <p v-else-if="!searchResults.length" class="px-1 text-caption text-ink-faint">
                {{ t('chat.header.noResults') }}
              </p>
              <div
                v-for="result in searchResults"
                :key="result.id"
                class="rounded-md bg-surface px-2.5 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-caption font-medium text-ink-muted">{{ result.peer?.fullName }}</span>
                  <span class="shrink-0 text-caption text-ink-faint">{{ formatClock(result.createdAt, locale) }}</span>
                </div>
                <p class="mt-0.5 line-clamp-2 text-small text-ink">
                  {{ markdownToPlainText(result.body) || result.attachment?.originalFilename }}
                </p>
              </div>
            </div>
          </div>

          <div ref="scrollEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" @scroll.passive="onScroll">
            <template v-if="chat.loadingMessages">
              <Skeleton v-for="i in 5" :key="i" class="h-14 w-2/3" />
            </template>

            <template v-else>
              <p v-if="chat.loadingOlder" class="py-1 text-center text-caption text-ink-faint">
                {{ t('common.loading') }}
              </p>

              <EmptyState
                v-if="!chat.messages.length"
                icon="message-square"
                :title="t('chat.empty')"
                :description="t('chat.emptyHint')"
                class="py-10"
              />

              <div v-for="group in grouped" :key="group.day" class="space-y-2.5">
                <div class="sticky top-0 z-10 flex justify-center py-1">
                  <span class="rounded-full bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-muted shadow-sm">
                    {{ formatDayLabel(group.at, locale, t) }}
                  </span>
                </div>
                <MessageBubble
                  v-for="message in group.messages"
                  :key="message.id"
                  :message="message"
                  :mine="message.senderId === auth.user?.id"
                  :peer-read-at="selected.peerReadAt"
                  :sender-name="message.senderId === auth.user?.id ? auth.user?.fullName : selected.peer?.fullName"
                  @edit="onEdit"
                  @delete="onDelete"
                  @preview-image="lightbox = $event"
                />
              </div>

              <div v-if="peerTyping" class="flex items-center gap-2 pt-1">
                <Avatar :name="selected.peer?.fullName ?? '?'" :src="selected.peer?.avatar" size="xs" />
                <span class="flex items-center gap-1 rounded-2xl bg-surface-2 px-3 py-2">
                  <span
                    v-for="i in 3"
                    :key="i"
                    class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
                    :style="{ animationDelay: `${(i - 1) * 140}ms` }"
                  />
                </span>
              </div>
            </template>
          </div>

          <p v-if="errorMessage" class="border-t border-danger/30 bg-danger-subtle px-4 py-2 text-small text-danger">
            {{ errorMessage }}
          </p>

          <MessageComposer
            ref="composer"
            :sending="sending"
            @send="onSend"
            @typing="chat.sendTyping"
            @error="toast.error($event)"
          />
        </template>

        <EmptyState
          v-else
          icon="message-square"
          :title="t('chat.inbox.selectPrompt')"
          :description="t('chat.inbox.selectHint')"
          class="m-auto"
        />
      </AppCard>

      <AppCard v-if="infoOpen && selected" padding="none" class="hidden min-h-0 overflow-hidden md:flex md:flex-col">
        <ConversationInfoPanel
          :details="details"
          :loading="detailsLoading"
          :online="peerOnline"
          @close="infoOpen = false"
          @preview-image="lightbox = $event"
        />
      </AppCard>
    </div>

    <!-- Image lightbox -->
    <Teleport to="body">
      <div
        v-if="lightbox"
        class="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-6"
        @click="lightbox = null"
      >
        <img :src="lightbox.url" :alt="lightbox.originalFilename" class="max-h-full max-w-full rounded-lg object-contain" />
        <button
          type="button"
          class="absolute right-5 top-5 rounded-full bg-white/15 p-2 text-white transition-default hover:bg-white/25"
          :aria-label="t('chat.info.close')"
        >
          <Icon name="close" size="18" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
