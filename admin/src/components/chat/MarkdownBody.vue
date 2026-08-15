<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps({
  source: { type: String, default: '' },
})

// Safe by construction: renderMarkdown escapes the input before emitting
// any markup, so nothing the sender typed can become a tag. See
// utils/markdown.js for the full reasoning behind skipping a sanitizer.
const html = computed(() => renderMarkdown(props.source))
</script>

<template>
  <div class="markdown-body space-y-1.5 break-words" v-html="html" />
</template>

<style scoped>
/* Only spacing rules live here — every colour comes from the bubble's own
   text colour via `currentColor`, so the same markup reads correctly on a
   primary-tinted outgoing bubble and a neutral incoming one. */
.markdown-body :deep(p) {
  margin: 0;
}
.markdown-body :deep(a) {
  word-break: break-all;
}
.markdown-body :deep(pre) {
  white-space: pre;
}
</style>
