<script setup>
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

/**
 * A small rich-text field: bold, italic, lists, links.
 *
 * `contenteditable` with `execCommand`, which is formally deprecated and
 * still the only formatting API every browser implements. The alternative is
 * a third-party editor — a few hundred kilobytes and its own HTML dialect —
 * for four buttons. What keeps that acceptable is that the server does not
 * trust this component: every TEXT block is sanitised against an allowlist
 * on the way in (backend `lessonBlocks.js`), so the worst a broken editor
 * can produce is markup that gets stripped.
 *
 * The toolbar is deliberately shorter than the sanitiser's allowlist. An
 * author who pastes a heading or a table keeps it — paste goes through the
 * same allowlist — but the buttons only offer what a paragraph of a lesson
 * actually needs; headings and tables are blocks of their own.
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  minHeight: { type: String, default: '5rem' },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const editor = ref(null)
const focused = ref(false)

function sync() {
  emit('update:modelValue', editor.value?.innerHTML ?? '')
}

/**
 * Writes the incoming value into the element — but never while it has focus.
 *
 * Setting `innerHTML` moves the caret to the start, so echoing a value back
 * during typing sends the cursor to the beginning of the paragraph on every
 * keystroke. Autosave makes that concrete: it re-emits the saved value a
 * second after the last keypress.
 */
function adopt(value) {
  if (!editor.value || focused.value) return
  if (editor.value.innerHTML !== value) editor.value.innerHTML = value ?? ''
}

onMounted(() => adopt(props.modelValue))
watch(() => props.modelValue, adopt)

function run(command, value = null) {
  if (props.disabled) return
  editor.value?.focus()
  document.execCommand(command, false, value)
  sync()
}

function addLink() {
  const url = window.prompt(t('richText.linkPrompt'))
  if (!url) return
  // http(s) only, and checked here as well as on the server: the sanitiser
  // would drop a `javascript:` href, but silently — the author would see
  // their link disappear on save with no idea why.
  if (!/^https?:\/\//i.test(url)) {
    window.alert(t('richText.linkInvalid'))
    return
  }
  run('createLink', url)
}

/**
 * Paste as text the browser has already cleaned, not as the source
 * document's markup.
 *
 * Pasting from Word or a web page brings a wall of `style` and `class`
 * attributes and, in Word's case, whole conditional-comment blocks. The
 * server strips all of it, which means the author sees something on screen
 * that is not what gets saved. Inserting the plain text keeps the two the
 * same; the buttons are there to add the formatting back.
 */
function onPaste(event) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') ?? ''
  document.execCommand('insertText', false, text)
  sync()
}

const TOOLS = [
  { command: 'bold', icon: 'bold', labelKey: 'richText.bold' },
  { command: 'italic', icon: 'italic', labelKey: 'richText.italic' },
  { command: 'insertUnorderedList', icon: 'list', labelKey: 'richText.bulletList' },
]
</script>

<template>
  <div class="rounded-lg border border-border-strong bg-surface">
    <div class="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
      <button
        v-for="tool in TOOLS"
        :key="tool.command"
        type="button"
        class="rounded p-1.5 text-ink-muted transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        :title="t(tool.labelKey)"
        :aria-label="t(tool.labelKey)"
        :disabled="disabled"
        @click="run(tool.command)"
      >
        <Icon :name="tool.icon" size="14" />
      </button>
      <button
        type="button"
        class="rounded p-1.5 text-ink-muted transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        :title="t('richText.link')"
        :aria-label="t('richText.link')"
        :disabled="disabled"
        @click="addLink"
      >
        <Icon name="link" size="14" />
      </button>
      <button
        type="button"
        class="ml-auto rounded px-2 py-1 text-caption text-ink-faint transition-default hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        :disabled="disabled"
        @click="run('removeFormat')"
      >
        {{ t('richText.clear') }}
      </button>
    </div>

    <div
      ref="editor"
      class="prose-lesson px-3 py-2 text-small text-ink outline-none"
      :class="disabled ? 'opacity-60' : ''"
      :style="{ minHeight }"
      :contenteditable="!disabled"
      :data-placeholder="placeholder"
      role="textbox"
      aria-multiline="true"
      @input="sync"
      @blur="focused = false; sync()"
      @focus="focused = true"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
/* The empty-state hint. A `placeholder` attribute does nothing on a
   contenteditable element, so it is drawn from the data attribute. */
[contenteditable]:empty::before {
  content: attr(data-placeholder);
  color: rgb(var(--color-text-faint));
}

/* Enough shape that what the author types looks like what the reader gets;
   the reader's own rules live in LessonBlock.vue. */
.prose-lesson :deep(ul),
.prose-lesson :deep(ol) {
  margin: 0.25rem 0 0.25rem 1.1rem;
  list-style: revert;
}
.prose-lesson :deep(a) {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}
.prose-lesson :deep(p) {
  margin: 0 0 0.4rem;
}
</style>
