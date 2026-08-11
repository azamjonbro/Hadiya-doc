<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiChatApi } from '@/services/aiChat'
import { useToast } from '@/composables/useToast'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const props = defineProps({
  courseId: { type: String, required: true },
  topicId: { type: String, default: null },
  videoId: { type: String, default: null },
})

const { t } = useI18n()
const toast = useToast()

const messages = ref([])
const draft = ref('')
const loadingHistory = ref(true)
const sending = ref(false)
const unavailable = ref(false)
const scrollEl = ref(null)

const scope = computed(() => ({ courseId: props.courseId, topicId: props.topicId, videoId: props.videoId }))

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    const { items } = await aiChatApi.history(scope.value)
    messages.value = items
    scrollToBottom()
  } catch {
    // History failing to load isn't fatal — the chat still works forward from here.
  } finally {
    loadingHistory.value = false
  }
}

async function send(text) {
  const trimmed = text.trim()
  if (!trimmed || sending.value) return

  draft.value = ''
  sending.value = true
  const optimisticId = `pending-${Date.now()}`
  messages.value.push({ id: optimisticId, role: 'user', content: trimmed, createdAt: new Date().toISOString(), pending: true })
  scrollToBottom()

  try {
    const { userMessage, assistantMessage } = await aiChatApi.send({ ...scope.value, message: trimmed })
    const idx = messages.value.findIndex((m) => m.id === optimisticId)
    if (idx !== -1) messages.value.splice(idx, 1, userMessage)
    messages.value.push(assistantMessage)
    scrollToBottom()
  } catch (error) {
    messages.value = messages.value.filter((m) => m.id !== optimisticId)
    const code = error.response?.data?.code
    if (code === 'AI_CHAT_UNAVAILABLE') {
      unavailable.value = true
      toast.error(t('aiChat.errors.unavailable'))
    } else if (code === 'COURSE_ACCESS_DENIED') {
      toast.error(t('aiChat.errors.accessDenied'))
    } else {
      toast.error(t('aiChat.errors.generic'))
    }
  } finally {
    sending.value = false
  }
}

function onSubmit() {
  send(draft.value)
}

onMounted(loadHistory)
</script>

<template>
  <section class="rounded-xl border border-border bg-surface">
    <div class="flex items-center gap-2 border-b border-border px-4 py-3">
      <Icon name="message-square" size="18" class="text-primary" />
      <div>
        <h3 class="text-small font-semibold text-ink">{{ t('aiChat.title') }}</h3>
        <p class="text-caption text-ink-faint">{{ t('aiChat.subtitle') }}</p>
      </div>
    </div>

    <div ref="scrollEl" class="max-h-80 space-y-3 overflow-y-auto px-4 py-4">
      <template v-if="loadingHistory">
        <Skeleton class="h-10 w-2/3" />
        <Skeleton class="h-10 w-1/2" />
      </template>

      <p v-else-if="messages.length === 0" class="py-6 text-center text-small text-ink-faint">
        {{ t('aiChat.empty') }}
      </p>

      <div
        v-for="m in messages"
        :key="m.id"
        class="flex"
        :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-small"
          :class="
            m.role === 'user'
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-2 text-ink border border-border'
          "
          :style="m.pending ? { opacity: 0.6 } : {}"
        >
          {{ m.content }}
        </div>
      </div>

      <div v-if="sending" class="flex items-center gap-2 text-small text-ink-faint">
        <Icon name="loader" size="14" class="animate-spin" />
        {{ t('aiChat.thinking') }}
      </div>
    </div>

    <div class="flex flex-wrap gap-2 border-t border-border px-4 py-2">
      <button
        type="button"
        class="rounded-full border border-border px-3 py-1 text-caption text-ink-muted hover:bg-surface-2"
        :disabled="sending"
        @click="send(t('aiChat.quickActions.summarize'))"
      >
        {{ t('aiChat.quickActions.summarize') }}
      </button>
      <button
        type="button"
        class="rounded-full border border-border px-3 py-1 text-caption text-ink-muted hover:bg-surface-2"
        :disabled="sending"
        @click="send(t('aiChat.quickActions.keyPoints'))"
      >
        {{ t('aiChat.quickActions.keyPoints') }}
      </button>
      <button
        type="button"
        class="rounded-full border border-border px-3 py-1 text-caption text-ink-muted hover:bg-surface-2"
        :disabled="sending"
        @click="send(t('aiChat.quickActions.quiz'))"
      >
        {{ t('aiChat.quickActions.quiz') }}
      </button>
    </div>

    <form class="flex items-center gap-2 border-t border-border px-4 py-3" @submit.prevent="onSubmit">
      <input
        v-model="draft"
        type="text"
        :placeholder="t('aiChat.placeholder')"
        :disabled="sending || unavailable"
        class="h-9.5 flex-1 rounded-md border border-border bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <AppButton type="submit" icon="send" size="md" :loading="sending" :disabled="!draft.trim() || unavailable">
        {{ t('aiChat.send') }}
      </AppButton>
    </form>
  </section>
</template>
