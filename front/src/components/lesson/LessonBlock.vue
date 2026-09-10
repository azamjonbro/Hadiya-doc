<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'

/**
 * One lesson block, as a reader sees it.
 *
 * Shared by the learner's page and the author's preview, so "what the reader
 * gets" has exactly one implementation — a preview that renders through a
 * second code path is a preview that lies.
 *
 * TEXT, QUOTE and CALLOUT are the only types rendered with `v-html`, and
 * their content was sanitised against an allowlist on the way into the
 * database (backend `lessonBlocks.js`). CODE deliberately is not: it is
 * bound as text so a snippet that mentions a tag shows the tag.
 */
const props = defineProps({
  block: { type: Object, required: true },
  // Where the reader came from, so a FILE block can send them back to the
  // course page that knows how to open it rather than into a dead end.
  courseId: { type: String, default: '' },
})

const { t } = useI18n()

const CALLOUT_STYLES = {
  INFO: { box: 'border-info/30 bg-info-subtle text-info', icon: 'info' },
  WARNING: { box: 'border-warning/30 bg-warning-subtle text-warning', icon: 'alert-triangle' },
  SUCCESS: { box: 'border-success/30 bg-success-subtle text-success', icon: 'check-circle' },
  DANGER: { box: 'border-danger/30 bg-danger-subtle text-danger', icon: 'alert-circle' },
}

const callout = computed(() => CALLOUT_STYLES[props.block.variant] ?? CALLOUT_STYLES.INFO)
const headingTag = computed(() => `h${props.block.level ?? 2}`)

const MATERIAL_ICONS = {
  FILE: 'file-text',
  PRESENTATION: 'layers',
  MULTIMEDIA: 'mic',
}

function formatSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDuration(seconds) {
  if (!seconds) return ''
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
</script>

<template>
  <!-- A block whose referenced video or file the reader may not see. Shown
       rather than hidden: a gap in a numbered procedure is a question the
       reader cannot answer, and saying so is better than a paragraph that
       silently is not there. -->
  <div
    v-if="block.unavailable"
    class="flex items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2.5 text-caption text-ink-faint"
  >
    <Icon name="lock" size="14" />
    {{ t('lesson.blockUnavailable') }}
  </div>

  <component
    :is="headingTag"
    v-else-if="block.type === 'HEADING'"
    class="font-semibold text-ink"
    :class="block.level === 2 ? 'text-h4' : 'text-body'"
  >
    {{ block.text }}
  </component>

  <!-- eslint-disable vue/no-v-html -->
  <div v-else-if="block.type === 'TEXT'" class="prose-lesson text-body text-ink" v-html="block.text" />

  <figure v-else-if="block.type === 'QUOTE'" class="border-l-2 border-border-strong pl-4">
    <blockquote class="prose-lesson text-body italic text-ink-muted" v-html="block.text" />
    <figcaption v-if="block.author" class="mt-1 text-caption text-ink-faint">— {{ block.author }}</figcaption>
  </figure>

  <div v-else-if="block.type === 'CALLOUT'" class="flex gap-2.5 rounded-lg border px-3.5 py-3" :class="callout.box">
    <Icon :name="callout.icon" size="16" class="mt-0.5 shrink-0" />
    <div class="prose-lesson text-small" v-html="block.text" />
  </div>
  <!-- eslint-enable vue/no-v-html -->

  <div v-else-if="block.type === 'CODE'" class="overflow-hidden rounded-lg border border-border bg-surface-2">
    <div v-if="block.language" class="border-b border-border px-3 py-1 text-caption text-ink-faint">
      {{ block.language }}
    </div>
    <!-- Bound as text, never as markup: this is the one block whose content
         is not sanitised, because a code sample has to survive verbatim. -->
    <pre class="overflow-x-auto px-3 py-2.5 text-caption text-ink"><code>{{ block.text }}</code></pre>
  </div>

  <figure v-else-if="block.type === 'IMAGE'">
    <img :src="block.url" :alt="block.alt" class="w-full rounded-lg border border-border" loading="lazy" />
    <figcaption v-if="block.caption" class="mt-1.5 text-caption text-ink-faint">{{ block.caption }}</figcaption>
  </figure>

  <div v-else-if="block.type === 'GALLERY'" class="grid gap-2 sm:grid-cols-2">
    <figure v-for="(item, index) in block.items" :key="index">
      <img
        :src="item.url"
        :alt="item.alt"
        class="h-full w-full rounded-lg border border-border object-cover"
        loading="lazy"
      />
      <figcaption v-if="item.caption" class="mt-1 text-caption text-ink-faint">{{ item.caption }}</figcaption>
    </figure>
  </div>

  <figure v-else-if="block.type === 'EMBED'">
    <!-- sandbox without allow-same-origin: the frame may run its own scripts
         (a player needs them) but is treated as a foreign origin, so it
         cannot reach this page's storage or DOM. allow-popups is left out on
         purpose — an embed that can open a window can put a login form in
         front of the reader. -->
    <div class="aspect-video overflow-hidden rounded-lg border border-border bg-surface-2">
      <iframe
        :src="block.url"
        :title="block.caption || t('lesson.embedFrame')"
        class="h-full w-full"
        loading="lazy"
        referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-presentation"
        allowfullscreen
      />
    </div>
    <figcaption v-if="block.caption" class="mt-1.5 text-caption text-ink-faint">{{ block.caption }}</figcaption>
  </figure>

  <RouterLink
    v-else-if="block.type === 'VIDEO' && block.video"
    :to="`/videos/${block.video.id}`"
    class="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 transition-default hover:border-border-strong"
  >
    <span class="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
      <img v-if="block.video.posterUrl" :src="block.video.posterUrl" alt="" class="h-full w-full object-cover" />
      <Icon v-else name="play" size="16" class="text-ink-faint" />
    </span>
    <span class="min-w-0">
      <span class="block truncate text-small font-medium text-ink">{{ block.video.title }}</span>
      <span class="block text-caption text-ink-faint">
        {{ t('content.video') }}
        <template v-if="block.video.duration">· {{ formatDuration(block.video.duration) }}</template>
      </span>
    </span>
    <Icon name="arrow-right" size="15" class="ml-auto shrink-0 text-ink-faint" />
  </RouterLink>

  <RouterLink
    v-else-if="block.type === 'FILE' && block.material"
    :to="courseId ? `/courses/${courseId}` : '/courses'"
    class="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 transition-default hover:border-border-strong"
  >
    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-faint">
      <Icon :name="MATERIAL_ICONS[block.material.type] ?? 'file-text'" size="15" />
    </span>
    <span class="min-w-0">
      <span class="block truncate text-small font-medium text-ink">{{ block.material.title }}</span>
      <span class="block text-caption text-ink-faint">
        {{ t(`content.${(block.material.type || 'file').toLowerCase()}`) }}
        <template v-if="block.material.fileSize">· {{ formatSize(block.material.fileSize) }}</template>
      </span>
    </span>
    <Icon name="arrow-right" size="15" class="ml-auto shrink-0 text-ink-faint" />
  </RouterLink>

  <div v-else-if="block.type === 'TABLE'" class="overflow-x-auto">
    <table class="w-full border-collapse text-small">
      <thead v-if="block.hasHeader && block.rows?.length">
        <tr>
          <th
            v-for="(cell, index) in block.rows[0]"
            :key="index"
            class="border border-border bg-surface-2 px-2.5 py-1.5 text-left font-semibold text-ink"
          >
            {{ cell }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in block.hasHeader ? (block.rows ?? []).slice(1) : block.rows ?? []" :key="rowIndex">
          <td v-for="(cell, cellIndex) in row" :key="cellIndex" class="border border-border px-2.5 py-1.5 text-ink">
            {{ cell }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="block.caption" class="mt-1.5 text-caption text-ink-faint">{{ block.caption }}</p>
  </div>

  <hr v-else-if="block.type === 'DIVIDER'" class="border-border" />
</template>

<style scoped>
/* The typography for the three sanitised HTML blocks. Kept here rather than
   global so nothing else on the page inherits list markers back. */
.prose-lesson :deep(p) {
  margin: 0 0 0.6rem;
}
.prose-lesson :deep(p:last-child) {
  margin-bottom: 0;
}
.prose-lesson :deep(ul),
.prose-lesson :deep(ol) {
  margin: 0.4rem 0 0.6rem 1.2rem;
  list-style: revert;
}
.prose-lesson :deep(li) {
  margin: 0.15rem 0;
}
.prose-lesson :deep(a) {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}
.prose-lesson :deep(strong) {
  font-weight: 600;
}
.prose-lesson :deep(table) {
  border-collapse: collapse;
}
.prose-lesson :deep(td),
.prose-lesson :deep(th) {
  border: 1px solid rgb(var(--color-border));
  padding: 0.25rem 0.5rem;
}
</style>
