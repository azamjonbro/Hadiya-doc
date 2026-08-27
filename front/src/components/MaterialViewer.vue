<script setup>
/**
 * Reads a course material in place instead of sending it to the downloads
 * folder. Three different mechanics hide behind one window:
 *   - PDF and audio: the browser already renders these, so it gets a signed,
 *     short-lived URL and does the work itself (no whole-file download into
 *     memory, and range requests keep audio seekable).
 *   - docx / xlsx / pptx: nothing renders these natively, so the bytes are
 *     fetched through the API and parsed in the browser. Parsers are loaded
 *     on demand — a reader who only ever opens PDFs never downloads them.
 * Anything else keeps the download button, which is always present anyway.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { materialsApi } from '@/services/materials'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  material: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const { t } = useI18n()

// Parsing happens in this tab, so the whole file has to fit in memory. Past
// this size the reader is sent to the download rather than to a frozen tab.
const PARSE_MAX_BYTES = 40 * 1024 * 1024
// A spreadsheet exported from an analytics tool can carry tens of thousands
// of rows; rendering all of them as DOM nodes is what actually hangs the
// page, not the parsing.
const MAX_PREVIEW_ROWS = 500

const loading = ref(false)
const errorMessage = ref('')
const nativeUrl = ref('')
const docHtml = ref('')
const sheets = ref([])
const truncated = ref(false)
const pptxHost = ref(null)
let pptxPreviewer = null

const kind = computed(() => {
  const mime = props.material?.mimeType ?? ''
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime.includes('presentationml')) return 'pptx'
  return 'unknown'
})

const sizeLabel = computed(() => {
  const bytes = props.material?.fileSize ?? 0
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
})

function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    if (value.text !== undefined) return String(value.text)
    if (value.result !== undefined) return String(value.result)
    if (value.hyperlink) return String(value.hyperlink)
    return ''
  }
  return String(value)
}

function reset() {
  destroyPptx()
  nativeUrl.value = ''
  docHtml.value = ''
  sheets.value = []
  truncated.value = false
  errorMessage.value = ''
}

function destroyPptx() {
  pptxPreviewer?.destroy?.()
  pptxPreviewer = null
  if (pptxHost.value) pptxHost.value.innerHTML = ''
}

async function renderDocx(buffer) {
  const mammoth = await import('mammoth/mammoth.browser.js')
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  // mammoth emits a fixed, small set of elements (headings, lists, tables,
  // images as data URIs) — it has no pass-through for scripts or event
  // attributes, so its output is safe to mount as HTML.
  docHtml.value = result.value
}

async function renderXlsx(buffer) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  sheets.value = workbook.worksheets.map((worksheet) => {
    const rows = []
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      if (rows.length >= MAX_PREVIEW_ROWS) {
        truncated.value = true
        return
      }
      const cells = []
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(cellText(cell.value)))
      rows.push(cells)
    })
    return { name: worksheet.name, rows }
  })
}

// Unlike the other two renderers, this one hands nothing back to the
// template — it writes straight into a DOM node, so that node has to be
// mounted before it runs. The host only mounts once `loading` is false.
async function renderPptx(buffer) {
  const [{ init }, { repairPptx }] = await Promise.all([
    import('pptx-preview'),
    import('@/utils/pptxRepair'),
  ])
  const deck = await repairPptx(buffer)
  await nextTick()
  if (!pptxHost.value) throw new Error('pptx viewer host is not mounted')
  pptxHost.value.innerHTML = ''
  // clientWidth includes the host's own padding, so hand the previewer the
  // width it can actually draw in — otherwise every slide overflows right.
  const width = Math.max(320, (pptxHost.value.clientWidth || 900) - 32)
  pptxPreviewer = init(pptxHost.value, {
    width,
    height: Math.round((width * 9) / 16),
  })
  await pptxPreviewer.preview(deck)
  // preview() resolves either way: the library swallows its own load errors
  // and leaves an empty wrapper behind, which reads as a black rectangle. If
  // nothing came out of it, fail into the error state instead — that one at
  // least says so and offers the download.
  if (!pptxPreviewer.slideCount) throw new Error('pptx produced no slides')
}

async function load() {
  const material = props.material
  if (!material) return

  reset()
  loading.value = true
  try {
    if (kind.value === 'pdf' || kind.value === 'audio') {
      const { url } = await materialsApi.getUrl(material.id, 'inline')
      nativeUrl.value = url
      return
    }

    if (kind.value === 'unknown') return

    if (material.fileSize > PARSE_MAX_BYTES) {
      errorMessage.value = t('materials.tooLarge', { size: Math.round(PARSE_MAX_BYTES / (1024 * 1024)) })
      return
    }

    const buffer = await materialsApi.getContent(material.id)
    if (kind.value === 'docx') await renderDocx(buffer)
    else if (kind.value === 'xlsx') await renderXlsx(buffer)
    else if (kind.value === 'pptx') {
      // Drop the spinner before rendering, not after: renderPptx needs its
      // host element, and the template only swaps it in once loading is off.
      loading.value = false
      await renderPptx(buffer)
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? t('materials.error')
  } finally {
    loading.value = false
  }
}

async function onDownload() {
  try {
    const { url } = await materialsApi.getUrl(props.material.id, 'attachment')
    window.open(url, '_blank', 'noopener')
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? t('materials.error')
  }
}

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.material?.id,
  (id) => {
    if (id) {
      window.addEventListener('keydown', onKeydown)
      load()
    } else {
      window.removeEventListener('keydown', onKeydown)
      reset()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  destroyPptx()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="material" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" @click="emit('close')" />

      <div
        class="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        role="dialog"
        aria-modal="true"
      >
        <header class="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <div class="min-w-0 flex-1">
            <p class="truncate text-small font-semibold text-ink">{{ material.title }}</p>
            <p class="truncate text-caption text-ink-faint">
              {{ material.originalFilename }}<span v-if="sizeLabel"> · {{ sizeLabel }}</span>
            </p>
          </div>
          <AppButton variant="outline" size="sm" icon="download" @click="onDownload">
            {{ t('materials.download') }}
          </AppButton>
          <button
            type="button"
            class="rounded-md p-1.5 text-ink-faint transition-default hover:bg-surface-2 hover:text-ink"
            :aria-label="t('common.cancel')"
            @click="emit('close')"
          >
            <Icon name="close" size="18" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-auto bg-surface-2">
          <div v-if="loading" class="flex h-full items-center justify-center gap-2 text-small text-ink-muted">
            <Icon name="loader" size="16" class="animate-spin" />
            {{ t('materials.loading') }}
          </div>

          <div v-else-if="errorMessage" class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Icon name="alert-triangle" size="22" class="text-warning" />
            <p class="text-small text-ink-muted">{{ errorMessage }}</p>
            <AppButton size="sm" icon="download" @click="onDownload">{{ t('materials.download') }}</AppButton>
          </div>

          <iframe
            v-else-if="kind === 'pdf'"
            :src="nativeUrl"
            class="h-full w-full border-0 bg-surface"
            :title="material.title"
          />

          <div v-else-if="kind === 'audio'" class="flex h-full flex-col items-center justify-center gap-4 px-6">
            <span class="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <Icon name="mic" size="22" />
            </span>
            <audio :src="nativeUrl" controls class="w-full max-w-md" />
          </div>

          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-else-if="kind === 'docx'"
            class="material-doc mx-auto max-w-3xl bg-surface p-8 text-body text-ink"
            v-html="docHtml"
          />

          <div v-else-if="kind === 'xlsx'" class="space-y-6 p-5">
            <div v-for="sheet in sheets" :key="sheet.name">
              <p class="mb-2 text-caption font-semibold uppercase tracking-widest text-ink-faint">{{ sheet.name }}</p>
              <div class="overflow-x-auto rounded-lg border border-border bg-surface">
                <table class="w-full border-collapse text-caption">
                  <tbody>
                    <tr v-for="(row, rowIndex) in sheet.rows" :key="rowIndex" class="border-b border-border last:border-0">
                      <td
                        v-for="(cell, cellIndex) in row"
                        :key="cellIndex"
                        class="max-w-xs truncate border-r border-border px-2.5 py-1.5 last:border-0"
                        :class="rowIndex === 0 ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-muted'"
                        :title="cell"
                      >
                        {{ cell }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p v-if="truncated" class="text-caption text-ink-faint">
              {{ t('materials.truncated', { rows: MAX_PREVIEW_ROWS }) }}
            </p>
          </div>

          <div v-else-if="kind === 'pptx'" ref="pptxHost" class="flex min-h-full justify-center p-4" />

          <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Icon name="file-text" size="22" class="text-ink-faint" />
            <p class="text-small text-ink-muted">{{ t('materials.unsupported') }}</p>
            <AppButton size="sm" icon="download" @click="onDownload">{{ t('materials.download') }}</AppButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Word documents carry their own structure but no styling — these give the
   converted HTML the same reading rhythm as the rest of the app. */
.material-doc h1 { font-size: 1.5rem; font-weight: 600; margin: 1.25rem 0 0.75rem; }
.material-doc h2 { font-size: 1.25rem; font-weight: 600; margin: 1.15rem 0 0.6rem; }
.material-doc h3 { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.material-doc p { margin: 0.6rem 0; line-height: 1.7; }
.material-doc ul, .material-doc ol { margin: 0.6rem 0 0.6rem 1.4rem; list-style: revert; }
.material-doc li { margin: 0.25rem 0; }
.material-doc table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
.material-doc td, .material-doc th { border: 1px solid rgb(var(--color-border) / 1); padding: 0.4rem 0.6rem; }
.material-doc img { max-width: 100%; height: auto; }
.material-doc a { color: rgb(var(--color-primary) / 1); text-decoration: underline; }
</style>
