<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import MarkdownBody from './MarkdownBody.vue'
import VoiceRecorder from './VoiceRecorder.vue'
import { formatBytes } from '@/utils/chatFormat'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  sending: { type: Boolean, default: false },
})

const emit = defineEmits(['send', 'typing', 'error'])

const { t } = useI18n()

const draft = ref('')
const previewing = ref(false)
const textarea = ref(null)
const imageInput = ref(null)
const fileInput = ref(null)
const recorder = ref(null)
const recording = ref(false)

// A file chosen but not yet sent: it is uploaded only on send, so a change
// of mind costs nothing and never leaves an orphan object in storage.
const pending = ref(null)

const canSend = computed(() => Boolean(draft.value.trim() || pending.value) && !props.sending && !props.disabled)

const MARKDOWN_TOOLS = [
  { name: 'bold', icon: 'bold', before: '**', after: '**', labelKey: 'chat.compose.bold' },
  { name: 'italic', icon: 'italic', before: '*', after: '*', labelKey: 'chat.compose.italic' },
  { name: 'code', icon: 'code', before: '`', after: '`', labelKey: 'chat.compose.code' },
  { name: 'quote', icon: 'quote', before: '> ', after: '', labelKey: 'chat.compose.quote' },
  { name: 'list', icon: 'list', before: '- ', after: '', labelKey: 'chat.compose.list' },
  { name: 'link', icon: 'link', before: '[', after: '](https://)', labelKey: 'chat.compose.link' },
]

// Wraps the selection rather than appending at the end — the point of a
// toolbar is to format the words already typed.
async function applyTool(tool) {
  const element = textarea.value
  if (!element) return
  const start = element.selectionStart ?? draft.value.length
  const end = element.selectionEnd ?? start
  const selected = draft.value.slice(start, end)

  draft.value = draft.value.slice(0, start) + tool.before + selected + tool.after + draft.value.slice(end)

  await nextTick()
  autoGrow()
  element.focus()
  const caret = start + tool.before.length + selected.length
  element.setSelectionRange(caret, caret)
}

// Grows with the message up to the CSS max-height, so a multi-line
// markdown block is visible while it is being written instead of scrolling
// inside a one-row box.
function autoGrow() {
  const element = textarea.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

let typingTimer = null
function onInput() {
  autoGrow()
  emit('typing', true)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => emit('typing', false), 1800)
}

function onKeydown(event) {
  // Enter sends, Shift+Enter breaks the line — the convention people
  // already have in their fingers from every other chat client.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function pickImage() {
  imageInput.value?.click()
}

function pickFile() {
  fileInput.value?.click()
}

function stageFile(event, kind) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  pending.value = {
    kind,
    file,
    name: file.name,
    size: file.size,
    // Local preview for images so the sender sees what they picked before
    // it ever leaves the browser.
    previewUrl: kind === 'IMAGE' ? URL.createObjectURL(file) : '',
  }
}

function clearPending() {
  if (pending.value?.previewUrl) URL.revokeObjectURL(pending.value.previewUrl)
  pending.value = null
}

function onRecorded({ blob, durationSec }) {
  recording.value = false
  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type })
  // A voice note is the message — sent straight away rather than staged,
  // because the user already confirmed it by pressing stop.
  emit('send', { body: '', kind: 'VOICE', file, durationSec })
}

async function startRecording() {
  recording.value = true
  await recorder.value?.start()
  // start() bails out on a denied permission without ever recording; the
  // recorder emits the error, and this keeps the composer from staying
  // stuck in a recording state that never began.
  if (!recorder.value?.recording) recording.value = false
}

function onRecorderError(message) {
  recording.value = false
  emit('error', message)
}

// Pasting a screenshot is the fastest way to share one, so it goes through
// the same staging path as the file picker.
function onPaste(event) {
  const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'))
  if (!item) return
  const file = item.getAsFile()
  if (!file) return
  event.preventDefault()
  pending.value = {
    kind: 'IMAGE',
    file,
    name: file.name || 'clipboard.png',
    size: file.size,
    previewUrl: URL.createObjectURL(file),
  }
}

function submit() {
  if (!canSend.value) return
  const payload = pending.value
    ? { body: draft.value.trim(), kind: pending.value.kind, file: pending.value.file }
    : { body: draft.value.trim(), kind: 'TEXT', file: null }

  emit('send', payload)
  draft.value = ''
  previewing.value = false
  clearPending()
  emit('typing', false)
  nextTick(autoGrow)
}

defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <div class="border-t border-border bg-surface px-3 py-2.5">
    <!-- Always mounted (never v-if'd) so the ref is available to start it;
         the recorder renders nothing until it is actually recording. -->
    <VoiceRecorder ref="recorder" class="mb-1" @recorded="onRecorded" @error="onRecorderError" />

    <template v-if="!recording">
      <!-- Staged attachment -->
      <div v-if="pending" class="mb-2 flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2">
        <img
          v-if="pending.previewUrl"
          :src="pending.previewUrl"
          alt=""
          class="h-11 w-11 shrink-0 rounded-md object-cover"
        />
        <span v-else class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <Icon name="file-text" size="17" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-small font-medium text-ink">{{ pending.name }}</span>
          <span class="block text-caption text-ink-faint">{{ formatBytes(pending.size) }}</span>
        </span>
        <button
          type="button"
          class="rounded p-1 text-ink-faint transition-default hover:bg-surface-3 hover:text-ink"
          :aria-label="t('chat.actions.remove')"
          @click="clearPending"
        >
          <Icon name="close" size="15" />
        </button>
      </div>

      <div class="flex items-center gap-0.5 pb-1.5">
        <button
          v-for="tool in MARKDOWN_TOOLS"
          :key="tool.name"
          type="button"
          class="rounded p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
          :title="t(tool.labelKey)"
          :disabled="disabled"
          @click="applyTool(tool)"
        >
          <Icon :name="tool.icon" size="14" />
        </button>

        <span class="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          class="rounded px-1.5 py-1 text-caption font-medium transition-default"
          :class="previewing ? 'bg-primary-subtle text-primary' : 'text-ink-faint hover:bg-surface-2 hover:text-ink'"
          :disabled="!draft.trim()"
          @click="previewing = !previewing"
        >
          {{ previewing ? t('chat.compose.write') : t('chat.compose.preview') }}
        </button>

        <span class="ml-auto text-caption text-ink-faint">{{ t('chat.compose.markdownHint') }}</span>
      </div>

      <div
        v-if="previewing"
        class="mb-2 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-ink"
      >
        <MarkdownBody :source="draft" />
      </div>

      <div class="flex items-end gap-1.5">
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          :title="t('chat.compose.attachImage')"
          :disabled="disabled"
          @click="pickImage"
        >
          <Icon name="image" size="17" />
        </button>
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          :title="t('chat.compose.attachFile')"
          :disabled="disabled"
          @click="pickFile"
        >
          <Icon name="paperclip" size="17" />
        </button>

        <textarea
          ref="textarea"
          v-model="draft"
          rows="1"
          :disabled="disabled"
          :placeholder="t('chat.placeholder')"
          class="max-h-40 min-h-[2.375rem] flex-1 resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-ink outline-none transition-default focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
          @input="onInput"
          @keydown="onKeydown"
          @paste="onPaste"
        />

        <button
          v-if="!draft.trim() && !pending"
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          :title="t('chat.compose.recordVoice')"
          :disabled="disabled"
          @click="startRecording"
        >
          <Icon name="mic" size="17" />
        </button>
        <button
          v-else
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-default hover:opacity-90 disabled:opacity-40"
          :title="t('chat.send')"
          :disabled="!canSend"
          @click="submit"
        >
          <Icon :name="sending ? 'loader' : 'send'" size="16" :class="sending ? 'animate-spin' : ''" />
        </button>
      </div>

      <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="stageFile($event, 'IMAGE')" />
      <input ref="fileInput" type="file" class="hidden" @change="stageFile($event, 'FILE')" />
    </template>
  </div>
</template>
