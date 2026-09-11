<script setup>
/**
 * Reads a course material in place, as a reader rather than a download.
 *
 * Anything with pages — a PDF or a presentation — is driven the way a player
 * is: one page at a time, with previous/next, an autoplay that advances on a
 * timer, a speed for that timer, and full screen. That is also what makes
 * progress measurable: the page you are on is reported as you turn it, so a
 * hundred-slide deck two slides in counts as two slides, not as "opened".
 *
 * Three mechanics behind one window:
 *   - PDF: parsed and drawn page by page with pdf.js. An <iframe> could show
 *     the file but not say how many pages it has or which one you are on, and
 *     both are the point here.
 *   - pptx: pptx-preview's load() + renderSingleSlide(), deliberately not its
 *     preview(), which renders every slide at once along with its own
 *     navigation.
 *   - docx / xlsx: flowing documents with no page model, parsed and shown as
 *     one scroll. Audio and anything else keep the browser's own handling.
 * Parsers load on demand — a reader who only opens PDFs never downloads the
 * presentation code.
 *
 * Paged formats wear the slide-player shell (portal §15): a 36px dark bar,
 * a white card with the slide in it, a 44px control row — slides list,
 * play, speed on the left; "1 / 20", previous, next on the right — and the
 * slides popover with a thumbnail and the first line of each page.
 */
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { materialsApi } from '@/services/materials'
import { offlineMaterialContent } from '@/offline/offlineContent'
import { enqueue } from '@/offline/queue'
import { apiErrorText } from '@/utils/apiError'
import { loadPdfjs, PDF_ASSET_OPTIONS } from '@/utils/pdfjs'
import { useFaceGate } from '@/composables/useFaceGate'
import { useFocusTrap } from '@/composables/useFocusTrap'
import AppButton from '@/components/ui/AppButton.vue'
import FaceGateOverlay from '@/components/face/FaceGateOverlay.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({
  material: { type: Object, default: null },
})
const emit = defineEmits(['close', 'progress'])

const { t } = useI18n()

// Parsing happens in this tab, so the whole file has to fit in memory. Past
// this size the reader is sent to the download rather than to a frozen tab.
const PARSE_MAX_BYTES = 40 * 1024 * 1024
// A spreadsheet exported from an analytics tool can carry tens of thousands
// of rows; rendering all of them as DOM nodes is what actually hangs the
// page, not the parsing.
const MAX_PREVIEW_ROWS = 500
// Seconds a page is held at 1× autoplay. Slow enough to read a slide, and
// the speed control moves it either way.
const AUTOPLAY_BASE_MS = 6000
const SPEEDS = [0.5, 1, 1.5, 2]
// A page is drawn to this fraction of the space it is given. The measurement
// below is honest about the header and the control bar, but a document that
// lands exactly on the boundary still produces a scrollbar over a rounding
// error, and a scrollbar on a page that is meant to fit is worse than a
// margin. Raise it towards 1 for edge-to-edge pages.
const PAGE_FIT = 0.98

const loading = ref(false)
const errorMessage = ref('')
// Set when the bytes came out of the offline store (12.2) — worth saying,
// because reading progress cannot be recorded from there.
const fromOffline = ref(false)
const nativeUrl = ref('')
const docHtml = ref('')
const sheets = ref([])
const truncated = ref(false)

const dialogEl = ref(null)
// Names the dialog with the material's own title, so a screen reader
// announces what was opened instead of "dialog" (12.4).
const titleId = useId()

// The viewer covers the whole window, so Tab has to stay inside it (12.4).
// No `onEscape` here: this component handles Escape itself, because the
// first Escape has to leave full screen rather than close the document.
useFocusTrap(dialogEl, { isActive: () => Boolean(props.material) })
const pageHost = ref(null)
const pdfCanvas = ref(null)

const pageCount = ref(0)
const page = ref(1)
const playing = ref(false)
const completed = ref(false)
const finishing = ref(false)
const speed = ref(1)
const isFullscreen = ref(false)

// The slides popover (§15). Thumbnails and first lines are built lazily
// the first time it opens — twenty small renders that nobody asked for
// would delay the first page for everyone who never opens the list.
const slidesOpen = ref(false)
const slideQuery = ref('')
const slides = ref([]) // [{ n, title, thumb }]
let slidesBuilt = false

let pptxPreviewer = null
let pdfDoc = null
let pdfRenderTask = null
let autoplayTimer = null
// Pages already reported this session. The server deduplicates too, but there
// is no reason to send the same page again every time it is revisited.
let reportedPages = new Set()

const kind = computed(() => {
  const mime = props.material?.mimeType ?? ''
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime.includes('presentationml')) return 'pptx'
  return 'unknown'
})

// Kind, not page count: the control bar has to exist before the first page is
// measured. Deciding it on pageCount meant the bar appeared *after* that
// measurement, shrinking the window the page had already been drawn for —
// which is exactly where the scrollbar came from. The controls sit disabled
// until the count is known.
const paged = computed(() => ['pdf', 'pptx'].includes(kind.value))
const pagesKnown = computed(() => pageCount.value > 0)
const canGoBack = computed(() => pagesKnown.value && page.value > 1)
const canGoForward = computed(() => pagesKnown.value && page.value < pageCount.value)

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

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
async function reportPage(pageNumber) {
  if (!props.material || !pageCount.value) return
  if (reportedPages.has(pageNumber)) return
  reportedPages.add(pageNumber)
  try {
    const progress = await materialsApi.recordPage(props.material.id, pageNumber, pageCount.value)
    completed.value = progress.completed
    // The course page redraws its bar from this rather than guessing.
    emit('progress', progress)
  } catch (error) {
    /**
     * Offline, "sent again later" means the next page turn on this
     * device (12.3) — and closing the document loses it. The report goes
     * into the queue instead; the server keeps the furthest page, so
     * repeating it changes nothing.
     */
    if (!error?.response) {
      const queued = await enqueue({
        id: `material-page:${props.material.id}:${pageNumber}`,
        url: `/materials/${props.material.id}/progress`,
        body: { page: pageNumber, totalPages: pageCount.value },
      })
      if (queued) return
    }
    // A page that failed to record can be sent again later.
    reportedPages.delete(pageNumber)
  }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
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

async function loadPdf(pdfjs, buffer) {
  pdfDoc = await pdfjs.getDocument({ data: buffer, ...PDF_ASSET_OPTIONS }).promise
  pageCount.value = pdfDoc.numPages
}

/**
 * The space a page actually has.
 *
 * Measured from the scroll container rather than the host element, because
 * the host is `h-full` inside it and reports the *content* height — which is
 * whatever the last page made it, not what is visible. The header and the
 * control bar are real estate too, and the bar in particular only exists once
 * the page count is known: the first page used to be drawn while the footer
 * was still absent, so it was sized for a taller window and overflowed the
 * moment the bar appeared.
 */
function pageBox() {
  // The host is the slide area itself now — a 16:9 box whose size is set
  // by the card, so its own client box is the honest measurement.
  const host = pageHost.value
  return {
    width: Math.max(320, host?.clientWidth ?? 900),
    height: Math.max(180, host?.clientHeight ?? 506),
  }
}

async function drawPdfPage(pageNumber) {
  if (!pdfDoc || !pdfCanvas.value) return
  // Cancel rather than queue: fast clicking through pages otherwise leaves
  // several renders racing for the same canvas, and the last to finish wins
  // — which is not necessarily the page the reader is on.
  pdfRenderTask?.cancel()

  const pdfPage = await pdfDoc.getPage(pageNumber)
  const unscaled = pdfPage.getViewport({ scale: 1 })
  const { width: available, height: availableHeight } = pageBox()
  // Fit whole pages, not just the width: a portrait page scaled to a wide
  // window would be taller than the screen and read like a scroll.
  const scale = Math.min(available / unscaled.width, availableHeight / unscaled.height) * PAGE_FIT
  const ratio = window.devicePixelRatio || 1
  const viewport = pdfPage.getViewport({ scale: scale * ratio })

  const canvas = pdfCanvas.value
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`

  pdfRenderTask = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport })
  try {
    await pdfRenderTask.promise
  } catch (error) {
    // A cancelled render is the expected outcome of turning the page quickly.
    if (error?.name !== 'RenderingCancelledException') throw error
  }
}

async function loadPptx(buffer) {
  const [{ init }, { repairPptx }] = await Promise.all([
    import('pptx-preview'),
    import('@/utils/pptxRepair'),
  ])
  const deck = await repairPptx(buffer)
  await nextTick()
  if (!pageHost.value) throw new Error('pptx viewer host is not mounted')
  pageHost.value.innerHTML = ''

  const box = pageBox()
  const width = Math.round(Math.min(box.width, (box.height * 16) / 9) * PAGE_FIT)
  pptxPreviewer = init(pageHost.value, { width, height: Math.round((width * 9) / 16) })
  // load(), not preview(): preview() paints every slide at once and adds its
  // own navigation, and this window has its own.
  await pptxPreviewer.load(deck)
  pageCount.value = pptxPreviewer.slideCount ?? 0
  if (!pageCount.value) throw new Error('pptx produced no slides')
}

function drawPptxSlide(pageNumber) {
  if (!pptxPreviewer) return
  pptxPreviewer.removeCurrentSlide?.()
  pptxPreviewer.renderSingleSlide(pageNumber - 1)
}

// ---------------------------------------------------------------------------
// Slides list (§15)
// ---------------------------------------------------------------------------
const THUMB_WIDTH = 152 // 76px at 2×

// The first line of text on a page stands in for its title; a page with no
// text (a full-bleed image) gets "---", which is also what iSpring shows.
async function pdfFirstLine(pdfPage) {
  try {
    const content = await pdfPage.getTextContent()
    // Up to the first line break — the heading, not the whole slide.
    const line = []
    for (const item of content.items) {
      if (item.str?.trim()) line.push(item.str)
      if (item.hasEOL && line.length) break
    }
    const text = line.join(' ').replace(/\s+/g, ' ').trim()
    return text ? text.slice(0, 60) : '---'
  } catch {
    return '---'
  }
}

async function pdfThumbnail(pdfPage) {
  const unscaled = pdfPage.getViewport({ scale: 1 })
  const viewport = pdfPage.getViewport({ scale: THUMB_WIDTH / unscaled.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.7)
}

async function buildSlides() {
  if (slidesBuilt || !pagesKnown.value) return
  slidesBuilt = true
  const count = pageCount.value
  slides.value = Array.from({ length: count }, (_, i) => ({ n: i + 1, title: '---', thumb: '' }))
  if (kind.value !== 'pdf' || !pdfDoc) return
  // One page at a time, and the list fills in as it goes; the popover is
  // already open and usable on the numbers alone.
  const doc = pdfDoc
  for (let n = 1; n <= count; n += 1) {
    if (pdfDoc !== doc) return // the material changed under us
    try {
      const pdfPage = await doc.getPage(n)
      const [title, thumb] = await Promise.all([pdfFirstLine(pdfPage), pdfThumbnail(pdfPage)])
      slides.value[n - 1] = { n, title, thumb }
    } catch {
      // A page that will not render keeps its number.
    }
  }
}

const visibleSlides = computed(() => {
  const q = slideQuery.value.trim().toLowerCase()
  if (!q) return slides.value
  return slides.value.filter((slide) => String(slide.n) === q || slide.title.toLowerCase().includes(q))
})

function toggleSlides() {
  slidesOpen.value = !slidesOpen.value
  if (slidesOpen.value) buildSlides()
}

function pickSlide(n) {
  slidesOpen.value = false
  showPage(n)
}

async function showPage(pageNumber) {
  const clamped = Math.min(Math.max(pageNumber, 1), pageCount.value || 1)
  page.value = clamped
  if (kind.value === 'pdf') await drawPdfPage(clamped)
  else if (kind.value === 'pptx') drawPptxSlide(clamped)
  reportPage(clamped)
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function goPrev() {
  if (canGoBack.value) showPage(page.value - 1)
}

function goNext() {
  if (canGoForward.value) showPage(page.value + 1)
  else stopAutoplay()
}

function startAutoplay() {
  if (!pagesKnown.value) return
  stopAutoplay()
  playing.value = true
  autoplayTimer = setInterval(goNext, AUTOPLAY_BASE_MS / speed.value)
}

function stopAutoplay() {
  clearInterval(autoplayTimer)
  autoplayTimer = null
  playing.value = false
}

function toggleAutoplay() {
  playing.value ? stopAutoplay() : startAutoplay()
}

// Offered at the end of the document, because "every page was displayed" and
// "I have finished this" are not the same thing: one slide skipped on the way
// through leaves the count at 9 of 10 with nothing the reader can do about it.
async function markFinished() {
  if (completed.value || finishing.value) return
  finishing.value = true
  try {
    const progress = await materialsApi.markComplete(props.material.id)
    completed.value = true
    emit('progress', progress)
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('materials.error'))
  } finally {
    finishing.value = false
  }
}

function cycleSpeed() {
  const next = SPEEDS[(SPEEDS.indexOf(speed.value) + 1) % SPEEDS.length]
  speed.value = next
  // Restart so the new interval takes effect on the current page, not the
  // next one.
  if (playing.value) startAutoplay()
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }
  await dialogEl.value?.requestFullscreen?.()
}

function onFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
  // The page is drawn to fit its container, and the container just changed.
  if (pagesKnown.value) showPage(page.value)
}

let resizeTimer = null
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (pagesKnown.value) showPage(page.value)
  }, 150)
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (slidesOpen.value) slidesOpen.value = false
    else if (!document.fullscreenElement) emit('close')
    return
  }
  if (!pagesKnown.value) return
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    goPrev()
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
    event.preventDefault()
    goNext()
  } else if (event.key === ' ') {
    event.preventDefault()
    toggleAutoplay()
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
function destroyViewers() {
  stopAutoplay()
  pdfRenderTask?.cancel()
  pdfRenderTask = null
  pdfDoc?.destroy?.()
  pdfDoc = null
  pptxPreviewer?.destroy?.()
  pptxPreviewer = null
  if (pageHost.value) pageHost.value.innerHTML = ''
}

function reset() {
  fromOffline.value = false
  destroyViewers()
  nativeUrl.value = ''
  docHtml.value = ''
  sheets.value = []
  truncated.value = false
  errorMessage.value = ''
  pageCount.value = 0
  page.value = 1
  completed.value = false
  finishing.value = false
  speed.value = 1
  reportedPages = new Set()
  slidesOpen.value = false
  slideQuery.value = ''
  slides.value = []
  slidesBuilt = false
}

// The same identity check the video player runs, in front of the reader: a
// presentation is a lesson too. The API is what decides it is needed — every
// call below 403s until it passes — and load() simply runs again afterwards.
const faceGate = useFaceGate(() => load())

async function load() {
  const material = props.material
  if (!material) return

  reset()
  loading.value = true
  try {
    if (kind.value === 'audio') {
      try {
        const { url } = await materialsApi.getUrl(material.id, 'inline')
        nativeUrl.value = url
      } catch (error) {
        // A signed URL needs the API; the saved bytes do not.
        const buffer = await offlineMaterialContent(material.id)
        if (!buffer) throw error
        nativeUrl.value = URL.createObjectURL(new Blob([buffer], { type: material.mimeType || 'audio/mpeg' }))
        fromOffline.value = true
      }
      return
    }

    if (kind.value === 'unknown') return

    if (material.fileSize > PARSE_MAX_BYTES) {
      errorMessage.value = t('materials.tooLarge', { size: Math.round(PARSE_MAX_BYTES / (1024 * 1024)) })
      return
    }

    // The library and the file are independent downloads, and the library is
    // the larger of the two. Fetching them one after the other made opening a
    // 32 KB PDF wait for half a megabyte of parser first.
    const pdfjsReady = kind.value === 'pdf' ? loadPdfjs() : null
    /**
     * The saved copy first when there is no network (12.2).
     *
     * Tried in this order rather than always preferring the store: online,
     * the server's copy is the current one, and a document replaced by its
     * author should not keep rendering from disk.
     */
    let buffer
    try {
      buffer = await materialsApi.getContent(material.id)
    } catch (error) {
      buffer = await offlineMaterialContent(material.id)
      if (!buffer) throw error
      fromOffline.value = true
    }
    if (kind.value === 'docx') {
      await renderDocx(buffer)
      return
    }
    if (kind.value === 'xlsx') {
      await renderXlsx(buffer)
      return
    }

    // Paged formats need their host element in the DOM, and the template only
    // swaps it in once the spinner is gone.
    if (kind.value === 'pdf') {
      await loadPdf(await pdfjsReady, buffer)
      loading.value = false
      await nextTick()
      await showPage(1)
      return
    }
    if (kind.value === 'pptx') {
      loading.value = false
      await loadPptx(buffer)
      await showPage(1)
    }
  } catch (error) {
    if (!faceGate.claim(error)) errorMessage.value = apiErrorText(error, t('materials.error'))
  } finally {
    loading.value = false
  }
}

/**
 * Whether the download button exists at all (7.5).
 *
 * The server refuses the attachment URL either way — this only avoids
 * offering a button that answers 403. Hiding it is presentation; the
 * refusal is the control.
 */
const canDownload = computed(() => props.material?.allowDownload !== false)

async function onDownload() {
  try {
    const { url } = await materialsApi.getUrl(props.material.id, 'attachment')
    window.open(url, '_blank', 'noopener')
  } catch (error) {
    // Downloading is gated the same way reading is, so the same overlay
    // handles it — the reader reloads once the check passes and the download
    // button is right there again.
    if (!faceGate.claim(error)) errorMessage.value = apiErrorText(error, t('materials.error'))
  }
}

watch(
  () => props.material?.id,
  (id) => {
    if (id) {
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('resize', onResize)
      document.addEventListener('fullscreenchange', onFullscreenChange)
      load()
    } else {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      faceGate.reset()
      reset()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (document.fullscreenElement) document.exitFullscreen?.()
  faceGate.stop()
  destroyViewers()
})
</script>

<template>
  <Teleport to="body">
    <!-- The player shell (§15): full screen, grey ground, dark 36px bar. -->
    <div
      v-if="material"
      ref="dialogEl"
      class="fixed inset-0 z-[90] flex flex-col bg-[#D9D9D9]"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="flex h-9 shrink-0 items-center justify-between bg-[#2B2B2B] px-3 text-white">
        <p :id="titleId" class="truncate text-[13px] font-semibold">{{ material.title }}</p>
        <div class="flex items-center gap-1">
          <button
            v-if="canDownload"
            type="button"
            class="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-white/80 hover:bg-white/10 hover:text-white"
            @click="onDownload"
          >
            <Icon name="download" size="14" />{{ t('materials.download') }}<span v-if="sizeLabel" class="text-white/50"> · {{ sizeLabel }}</span>
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10"
            :aria-label="isFullscreen ? t('materials.exitFullscreen') : t('materials.fullscreen')"
            :title="isFullscreen ? t('materials.exitFullscreen') : t('materials.fullscreen')"
            @click="toggleFullscreen"
          >
            <Icon :name="isFullscreen ? 'minimize' : 'maximize'" size="15" />
          </button>
          <button type="button" class="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10" :aria-label="t('common.cancel')" @click="emit('close')">
            <Icon name="close" size="16" />
          </button>
        </div>
      </div>

      <!-- Covers the whole reading area; the bar above keeps its ×, so the
           check is never a screen with no way out of it. -->
      <FaceGateOverlay
        v-if="faceGate.active.value"
        v-model:show-enrollment="faceGate.showEnrollment.value"
        full-page
        :state="faceGate.state.value"
        :action="faceGate.action.value"
        :error-message="faceGate.errorMessage.value"
        :stream="faceGate.cameraStream.value"
        @capture="faceGate.capture"
        @enrolled="faceGate.onEnrolled"
      />

      <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <!-- 12.2 — rendered from the saved copy. Said plainly, because
             reading progress cannot be recorded from here. -->
        <p v-if="fromOffline" class="absolute left-4 top-12 flex items-center gap-1.5 text-caption text-warning">
          <Icon name="alert-triangle" size="13" />
          {{ t('offline.readingSaved') }}
        </p>

        <div v-if="loading" class="flex w-full max-w-[984px] items-center justify-center gap-2 rounded bg-white py-24 text-small text-slate-500">
          <Icon name="loader" size="16" class="animate-spin" />
          {{ t('materials.loading') }}
        </div>

        <div v-else-if="errorMessage" class="flex w-full max-w-[720px] flex-col items-center justify-center gap-3 rounded bg-white px-6 py-16 text-center">
          <Icon name="alert-triangle" size="22" class="text-warning" />
          <p class="text-small text-slate-600">{{ errorMessage }}</p>
          <AppButton v-if="canDownload" size="sm" icon="download" @click="onDownload">{{ t('materials.download') }}</AppButton>
        </div>

        <div v-else-if="kind === 'audio'" class="flex w-full max-w-[720px] flex-col items-center justify-center gap-4 rounded bg-white px-6 py-16">
          <span class="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <Icon name="mic" size="22" />
          </span>
          <audio :src="nativeUrl" controls class="w-full max-w-md" />
        </div>

        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-else-if="kind === 'docx'"
          class="material-doc max-h-full w-full max-w-3xl self-stretch overflow-auto rounded bg-white p-8 text-body text-slate-900"
          v-html="docHtml"
        />

        <div v-else-if="kind === 'xlsx'" class="max-h-full w-full max-w-[984px] space-y-6 self-stretch overflow-auto rounded bg-white p-5">
          <div v-for="sheet in sheets" :key="sheet.name">
            <p class="mb-2 text-caption font-semibold uppercase tracking-widest text-slate-400">{{ sheet.name }}</p>
            <div class="overflow-x-auto rounded-lg border border-slate-200">
              <table class="w-full border-collapse text-caption">
                <tbody>
                  <tr v-for="(row, rowIndex) in sheet.rows" :key="rowIndex" class="border-b border-slate-200 last:border-0">
                    <td
                      v-for="(cell, cellIndex) in row"
                      :key="cellIndex"
                      class="max-w-xs truncate border-r border-slate-200 px-2.5 py-1.5 last:border-0"
                      :class="rowIndex === 0 ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'"
                      :title="cell"
                    >
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p v-if="truncated" class="text-caption text-slate-400">
            {{ t('materials.truncated', { rows: MAX_PREVIEW_ROWS }) }}
          </p>
        </div>

        <!-- The card: slide area 16:9, then the 44px control row. Its width
             is the window's, capped at the reference's 984px. -->
        <div v-else-if="paged" class="relative w-full max-w-[984px] rounded bg-white p-3 shadow-sm">
          <div
            ref="pageHost"
            class="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-white"
          >
            <canvas v-if="kind === 'pdf'" ref="pdfCanvas" class="max-h-full max-w-full" />
          </div>

          <div class="mt-3 flex h-10 items-center justify-between">
            <div class="flex items-center gap-2">
              <button
                type="button"
                :disabled="!pagesKnown"
                class="flex h-10 w-10 items-center justify-center rounded-md border-2 border-transparent bg-primary text-primary-foreground transition-default hover:opacity-90 disabled:opacity-40"
                :class="slidesOpen ? 'ring-2 ring-primary/40' : ''"
                :aria-expanded="slidesOpen"
                :title="t('materials.slides')"
                @click="toggleSlides"
              >
                <Icon name="list" size="20" />
              </button>
              <button
                type="button"
                :disabled="!pagesKnown"
                class="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-default hover:opacity-90 disabled:opacity-40"
                :title="playing ? t('materials.pause') : t('materials.play')"
                @click="toggleAutoplay"
              >
                <Icon :name="playing ? 'pause' : 'play'" size="20" />
              </button>
              <button
                type="button"
                class="flex h-10 min-w-10 items-center justify-center rounded-md border border-slate-300 px-2 text-[13px] font-medium text-slate-700 transition-default hover:bg-slate-50"
                :title="t('materials.speed')"
                @click="cycleSpeed"
              >
                {{ speed }}×
              </button>
            </div>

            <div class="flex items-center gap-2">
              <!-- Offered at the end: "every page was displayed" and "I have
                   finished" are not the same thing. Afterwards it closes the
                   reader — there is nothing left to do in here. -->
              <button
                v-if="completed"
                type="button"
                class="mr-2 flex h-9 items-center gap-1.5 rounded-md bg-success-subtle px-3 text-[13px] font-medium text-success transition-default hover:bg-success hover:text-success-foreground"
                @click="emit('close')"
              >
                <Icon name="check-circle" size="15" />
                {{ t('materials.doneClose') }}
              </button>
              <AppButton v-else-if="pagesKnown && page === pageCount" class="mr-2" size="sm" icon="check" :loading="finishing" @click="markFinished">
                {{ t('materials.markDone') }}
              </AppButton>

              <p class="mr-2 text-[13px] tabular-nums text-slate-500">
                <template v-if="pagesKnown">{{ t('materials.pageOf', { page, total: pageCount }) }}</template>
                <span v-else>— / —</span>
              </p>
              <button
                type="button"
                :disabled="!canGoBack"
                class="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition-default hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                :title="t('materials.prevPage')"
                @click="goPrev"
              >
                <Icon name="chevron-left" size="18" />
              </button>
              <button
                type="button"
                :disabled="!canGoForward"
                class="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-default hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                :title="t('materials.nextPage')"
                @click="goNext"
              >
                <Icon name="chevron-right" size="18" />
              </button>
            </div>
          </div>

          <!-- Slides popover: over the slide's bottom-left corner, 280px,
               the list scrolls. -->
          <Transition
            enter-active-class="transition-default"
            enter-from-class="opacity-0 translate-y-1"
            leave-active-class="transition-default"
            leave-to-class="opacity-0 translate-y-1"
          >
            <div
              v-if="slidesOpen"
              class="absolute bottom-[64px] left-3 z-10 flex max-h-[calc(100%-80px)] w-[280px] flex-col overflow-hidden rounded-lg bg-white text-slate-900 shadow-xl"
              @keydown.escape.stop="slidesOpen = false"
            >
              <div class="flex h-14 shrink-0 items-center justify-between px-5">
                <p class="text-[16px] font-semibold">{{ t('materials.slides') }}</p>
                <label class="relative flex items-center">
                  <Icon name="search" size="18" class="pointer-events-none absolute left-2 text-slate-500" />
                  <input
                    v-model="slideQuery"
                    type="search"
                    class="h-8 w-[130px] rounded-md border border-slate-200 bg-slate-50 pl-8 pr-2 text-[12px] outline-none placeholder:text-slate-400 focus:border-primary"
                    :placeholder="t('common.search')"
                    :aria-label="t('common.search')"
                  />
                </label>
              </div>
              <ul class="min-h-0 flex-1 overflow-y-auto bg-slate-50/60">
                <li v-for="slide in visibleSlides" :key="slide.n">
                  <button
                    type="button"
                    class="flex h-[76px] w-full items-center gap-3 px-5 text-left transition-default hover:bg-slate-100"
                    :class="slide.n === page ? 'bg-slate-200' : ''"
                    :aria-current="slide.n === page ? 'true' : undefined"
                    @click="pickSlide(slide.n)"
                  >
                    <span class="flex h-[43px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm">
                      <img v-if="slide.thumb" :src="slide.thumb" alt="" class="max-h-full max-w-full" />
                      <span v-else class="text-[11px] font-semibold text-slate-400">{{ slide.n }}</span>
                    </span>
                    <span class="truncate text-[13px] text-slate-700">{{ slide.n }}. {{ slide.title }}</span>
                  </button>
                </li>
                <li v-if="!visibleSlides.length" class="px-5 py-6 text-center text-[12px] text-slate-400">{{ t('materials.noSlides') }}</li>
              </ul>
            </div>
          </Transition>
        </div>

        <div v-else class="flex w-full max-w-[720px] flex-col items-center justify-center gap-3 rounded bg-white px-6 py-16 text-center">
          <Icon name="file-text" size="22" class="text-slate-400" />
          <p class="text-small text-slate-600">{{ t('materials.unsupported') }}</p>
          <AppButton v-if="canDownload" size="sm" icon="download" @click="onDownload">{{ t('materials.download') }}</AppButton>
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
