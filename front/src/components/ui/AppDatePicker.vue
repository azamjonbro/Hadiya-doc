<script setup>
/**
 * The one date field the whole app uses — a text box you can type into and a
 * calendar you can drive with the mouse or the keyboard.
 *
 * Two things it has to get right, because both were what made the old one
 * painful:
 *
 *  1. Where the popup lands. It is teleported to <body> and positioned
 *     `fixed` from the trigger's viewport rect, not absolutely inside the
 *     field. An absolutely-positioned popup is clipped by any scrolling
 *     ancestor, which in this app means every modal — the calendar was being
 *     cut off exactly when the field sat near the bottom of a dialog. Fixed
 *     placement also makes the flip honest: it opens upward when the space
 *     below cannot hold it, right-aligns when it would run past the right
 *     edge, and is clamped to the viewport either way.
 *
 *  2. Reaching a distant year. Nobody enters a date of birth by pressing "‹"
 *     three hundred times, so the header is a button: days → months → years,
 *     and the text box accepts 12.04.1998 typed straight in.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps({
  // 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:mm' when withTime.
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  withTime: { type: Boolean, default: false },
  // Both 'YYYY-MM-DD'. Days outside are unselectable and the year grid stops
  // there, which is what makes a birth-date field stop offering 2041.
  min: { type: String, default: '' },
  max: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const { t, locale } = useI18n()

// Chromium's bundled ICU data is incomplete for 'uz' (named month/weekday
// fields silently fall back to a generic "2026 M08" skeleton instead of an
// actual month name) — so calendar labels are hardcoded per locale rather
// than trusted to Intl.DateTimeFormat.
const MONTH_NAMES = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}
const MONTH_SHORT = {
  uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
const WEEKDAY_SHORT = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

const POPUP_WIDTH = 288 // w-72, needed before the popup is measurable
const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 6
const YEARS_PER_PAGE = 12

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Parsed by hand into local-time parts: `new Date('2026-08-28')` is UTC
// midnight, which renders as the 27th anywhere west of Greenwich.
function parseValue(value) {
  if (!value) return null
  const [datePart, timePart] = String(value).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  const [h, min] = timePart ? timePart.split(':').map(Number) : [0, 0]
  const date = new Date(y, m - 1, d, h || 0, min || 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function toISOValue(date) {
  const base = toISODate(date)
  return props.withTime ? `${base}T${pad2(date.getHours())}:${pad2(date.getMinutes())}` : base
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const minDate = computed(() => (props.min ? parseValue(props.min) : null))
const maxDate = computed(() => (props.max ? parseValue(props.max) : null))

function isOutOfRange(date) {
  const day = startOfDay(date)
  if (minDate.value && day < startOfDay(minDate.value)) return true
  if (maxDate.value && day > startOfDay(maxDate.value)) return true
  return false
}

function clampToRange(date) {
  if (minDate.value && date < startOfDay(minDate.value)) return startOfDay(minDate.value)
  if (maxDate.value && date > startOfDay(maxDate.value)) return startOfDay(maxDate.value)
  return date
}

const selected = computed(() => parseValue(props.modelValue))

const open = ref(false)
const view = ref('days') // days | months | years
const rootEl = ref(null)
const triggerEl = ref(null)
const popupEl = ref(null)
const popupStyle = ref({})
const viewDate = ref(selected.value ?? clampToRange(new Date()))
// The day the arrow keys move. Separate from the selection so the keyboard
// can walk across a month without writing a value on every keystroke.
const focusedDate = ref(viewDate.value)
const timeValue = ref(
  selected.value ? `${pad2(selected.value.getHours())}:${pad2(selected.value.getMinutes())}` : '12:00'
)

const monthNames = computed(() => MONTH_NAMES[locale.value] ?? MONTH_NAMES.en)
const monthShort = computed(() => MONTH_SHORT[locale.value] ?? MONTH_SHORT.en)
const weekdayLabels = computed(() => WEEKDAY_SHORT[locale.value] ?? WEEKDAY_SHORT.en)

const yearPageStart = computed(() => Math.floor(viewDate.value.getFullYear() / YEARS_PER_PAGE) * YEARS_PER_PAGE)

const headerLabel = computed(() => {
  if (view.value === 'days') return `${monthNames.value[viewDate.value.getMonth()]} ${viewDate.value.getFullYear()}`
  if (view.value === 'months') return String(viewDate.value.getFullYear())
  return `${yearPageStart.value} — ${yearPageStart.value + YEARS_PER_PAGE - 1}`
})

// ---------------------------------------------------------------------------
// Typing
// ---------------------------------------------------------------------------
// What the box shows while it is not being edited. Day-first, because that is
// how a date is written in all three locales this app ships.
function formatDisplay(date) {
  if (!date) return ''
  const datePart = `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
  return props.withTime ? `${datePart} ${pad2(date.getHours())}:${pad2(date.getMinutes())}` : datePart
}

const typedText = ref(formatDisplay(selected.value))
const editing = ref(false)

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseValue(value)
    if (parsed) {
      viewDate.value = parsed
      focusedDate.value = parsed
      timeValue.value = `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
    }
    if (!editing.value) typedText.value = formatDisplay(parsed)
  }
)

/**
 * Accepts what people actually type: 12.04.1998, 12/04/1998, 12-04-1998, and
 * the ISO 1998-04-12 that a paste from elsewhere produces. Two-digit years are
 * refused rather than guessed at — for a date of birth, guessing the century
 * is worse than asking.
 */
function parseTyped(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return ''

  const [datePart, timePart] = raw.split(/\s+/)
  const iso = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const dmy = datePart.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/)
  if (!iso && !dmy) return null

  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]

  const date = new Date(year, month - 1, day)
  // Rejects 31.02 — the Date constructor rolls it over to 03.03 rather than
  // failing, so the round trip is the check.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  if (isOutOfRange(date)) return null

  if (props.withTime) {
    const [h, min] = (timePart ?? timeValue.value).split(':').map(Number)
    date.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(min) ? min : 0)
  }
  return toISOValue(date)
}

function onTyping(event) {
  editing.value = true
  typedText.value = event.target.value
  const parsed = parseTyped(typedText.value)
  // Only commit a complete, valid date. Half-typed input leaves the model
  // alone so a form does not see 12.04.19 as a real year.
  if (parsed !== null) emit('update:modelValue', parsed)
}

function onBlur() {
  editing.value = false
  // Anything unparseable snaps back to the stored value rather than sitting
  // there looking accepted.
  typedText.value = formatDisplay(selected.value)
}

// ---------------------------------------------------------------------------
// Grids
// ---------------------------------------------------------------------------
const gridDays = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0
  const start = new Date(year, month, 1 - firstWeekday)
  const today = new Date()
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return {
      date,
      inMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
      isSelected: selected.value ? isSameDay(date, selected.value) : false,
      isFocused: isSameDay(date, focusedDate.value),
      disabled: isOutOfRange(date),
    }
  })
})

const gridMonths = computed(() =>
  monthShort.value.map((label, index) => ({
    label,
    index,
    isSelected: selected.value
      ? selected.value.getFullYear() === viewDate.value.getFullYear() && selected.value.getMonth() === index
      : false,
    // A month is out of reach only when every one of its days is.
    disabled:
      isOutOfRange(new Date(viewDate.value.getFullYear(), index, 1)) &&
      isOutOfRange(new Date(viewDate.value.getFullYear(), index + 1, 0)),
  }))
)

const gridYears = computed(() =>
  Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
    const year = yearPageStart.value + i
    return {
      year,
      isSelected: selected.value ? selected.value.getFullYear() === year : false,
      disabled: isOutOfRange(new Date(year, 0, 1)) && isOutOfRange(new Date(year, 11, 31)),
    }
  })
)

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function step(direction) {
  const d = viewDate.value
  if (view.value === 'days') viewDate.value = new Date(d.getFullYear(), d.getMonth() + direction, 1)
  else if (view.value === 'months') viewDate.value = new Date(d.getFullYear() + direction, d.getMonth(), 1)
  else viewDate.value = new Date(d.getFullYear() + direction * YEARS_PER_PAGE, d.getMonth(), 1)
}

function zoomOut() {
  view.value = view.value === 'days' ? 'months' : 'years'
}

function pickMonth(month) {
  viewDate.value = new Date(viewDate.value.getFullYear(), month.index, 1)
  view.value = 'days'
}

function pickYear(entry) {
  viewDate.value = new Date(entry.year, viewDate.value.getMonth(), 1)
  view.value = 'months'
}

function commit(date) {
  const [h, min] = props.withTime ? timeValue.value.split(':').map(Number) : [0, 0]
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, min || 0)
  emit('update:modelValue', toISOValue(next))
  typedText.value = formatDisplay(next)
  // With a time to set, the popup stays open — the date is only half the value.
  if (!props.withTime) close()
}

function pickDay(day) {
  if (day.disabled) return
  focusedDate.value = day.date
  commit(day.date)
}

function onTimeChange(event) {
  timeValue.value = event.target.value
  if (!selected.value) return
  commit(selected.value)
}

function goToday() {
  const today = clampToRange(new Date())
  viewDate.value = today
  focusedDate.value = today
  view.value = 'days'
  if (!isOutOfRange(today)) commit(today)
}

function clearValue() {
  emit('update:modelValue', '')
  typedText.value = ''
  close()
}

// Arrow keys walk the grid; the month follows the cursor across its edges.
function onGridKeydown(event) {
  if (view.value !== 'days') return
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const days = moves[event.key]

  if (days !== undefined) {
    event.preventDefault()
    const d = focusedDate.value
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
    focusedDate.value = next
    viewDate.value = new Date(next.getFullYear(), next.getMonth(), 1)
    return
  }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    step(event.key === 'PageUp' ? -1 : 1)
    return
  }
  if (event.key === 'Enter' && !isOutOfRange(focusedDate.value)) {
    event.preventDefault()
    commit(focusedDate.value)
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
/**
 * Which quadrant of the viewport the field sits in decides where the popup
 * goes: down unless the space below cannot hold it and the space above can,
 * left-aligned unless that would overflow the right edge. Whatever survives
 * that is clamped into the viewport, so a popup taller than the screen is
 * scrolled to rather than half-drawn off it.
 */
function positionPopup() {
  const trigger = triggerEl.value
  const popup = popupEl.value
  if (!trigger || !popup) return

  const rect = trigger.getBoundingClientRect()
  const width = popup.offsetWidth || POPUP_WIDTH
  const height = popup.offsetHeight

  const spaceBelow = window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN
  const dropUp = spaceBelow < height && spaceAbove > spaceBelow

  let top = dropUp ? rect.top - height - TRIGGER_GAP : rect.bottom + TRIGGER_GAP
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN))

  let left = rect.left
  if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = rect.right - width
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN))

  popupStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
}

// `true` for the capture phase: a modal scrolls its own overflow container,
// which does not bubble a scroll event to window.
function watchViewport(active) {
  const method = active ? 'addEventListener' : 'removeEventListener'
  window[method]('scroll', positionPopup, true)
  window[method]('resize', positionPopup)
  document[method]('mousedown', onPointerDown, true)
  document[method]('keydown', onDocumentKeydown)
}

function onPointerDown(event) {
  if (rootEl.value?.contains(event.target)) return
  if (popupEl.value?.contains(event.target)) return
  close()
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') {
    close()
    triggerEl.value?.focus()
  }
}

async function openPopup() {
  if (props.disabled || open.value) return
  open.value = true
  view.value = 'days'
  const anchor = selected.value ?? clampToRange(new Date())
  viewDate.value = anchor
  focusedDate.value = anchor
  await nextTick()
  positionPopup()
  watchViewport(true)
}

function close() {
  if (!open.value) return
  open.value = false
  watchViewport(false)
}

function toggle() {
  open.value ? close() : openPopup()
}

onBeforeUnmount(() => watchViewport(false))

const inputId = `datepicker-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div ref="rootEl" class="relative">
    <label v-if="label" :for="inputId" class="mb-1.5 block text-small font-medium text-ink">
      {{ label }}
      <span v-if="required" class="text-danger">*</span>
    </label>

    <div class="relative">
      <Icon name="calendar" size="17" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        :id="inputId"
        ref="triggerEl"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :disabled="disabled"
        :value="typedText"
        :placeholder="placeholder || (withTime ? 'kk.oo.yyyy 00:00' : 'kk.oo.yyyy')"
        class="h-10.5 w-full rounded-md border bg-surface pl-10 pr-9 text-body text-ink outline-none transition-default placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50"
        :class="error ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/15' : 'border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/15'"
        @input="onTyping"
        @blur="onBlur"
        @focus="openPopup"
        @keydown.esc.stop="close"
        @keydown.down.prevent="openPopup"
      />

      <button
        v-if="modelValue && !disabled"
        type="button"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint transition-default hover:text-ink"
        tabindex="-1"
        :aria-label="t('common.clear')"
        @click.stop="clearValue"
      >
        <Icon name="close" size="15" />
      </button>
      <button
        v-else
        type="button"
        :disabled="disabled"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint transition-default hover:text-ink disabled:opacity-50"
        tabindex="-1"
        @click.stop="toggle"
      >
        <Icon name="chevron-down" size="15" />
      </button>

      <!-- Visually hidden, kept in sync with modelValue so the surrounding
           <form>'s native required/constraint validation still fires even
           though the visible control is a free-text box. -->
      <input
        :type="withTime ? 'datetime-local' : 'date'"
        :required="required"
        :value="modelValue"
        tabindex="-1"
        aria-hidden="true"
        class="sr-only"
      />
    </div>

    <p v-if="error" class="mt-1.5 text-small text-danger">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-small text-ink-faint">{{ hint }}</p>

    <!-- To <body>: inside the field, any scrolling ancestor (every modal in
         this app) would clip it. -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popupEl"
        class="fixed z-[60] w-72 rounded-lg border border-border bg-surface p-3 text-small shadow-lg"
        :style="popupStyle"
        @keydown="onGridKeydown"
      >
        <div class="flex items-center justify-between">
          <button type="button" class="rounded-md p-1.5 text-ink-muted transition-default hover:bg-surface-2" @click="step(-1)">
            <Icon name="chevron-left" size="16" />
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 font-medium capitalize text-ink transition-default hover:bg-surface-2"
            :disabled="view === 'years'"
            @click="zoomOut"
          >
            {{ headerLabel }}
          </button>
          <button type="button" class="rounded-md p-1.5 text-ink-muted transition-default hover:bg-surface-2" @click="step(1)">
            <Icon name="chevron-right" size="16" />
          </button>
        </div>

        <template v-if="view === 'days'">
          <div class="mt-2 grid grid-cols-7 gap-1 text-center text-caption text-ink-faint">
            <span v-for="(wd, i) in weekdayLabels" :key="i">{{ wd }}</span>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1">
            <button
              v-for="(day, i) in gridDays"
              :key="i"
              type="button"
              :disabled="day.disabled"
              class="flex h-8 w-8 items-center justify-center rounded-md text-small transition-default disabled:cursor-not-allowed disabled:opacity-30"
              :class="[
                day.isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-2',
                !day.isSelected && day.isToday ? 'border border-primary/50 text-primary' : '',
                !day.isSelected && day.isFocused ? 'ring-2 ring-primary/30' : '',
                !day.isSelected && !day.isToday ? (day.inMonth ? 'text-ink' : 'text-ink-faint') : '',
              ]"
              @click="pickDay(day)"
            >
              {{ day.date.getDate() }}
            </button>
          </div>
        </template>

        <div v-else-if="view === 'months'" class="mt-2 grid grid-cols-3 gap-1.5">
          <button
            v-for="month in gridMonths"
            :key="month.index"
            type="button"
            :disabled="month.disabled"
            class="rounded-md py-2 text-small capitalize transition-default disabled:cursor-not-allowed disabled:opacity-30"
            :class="month.isSelected ? 'bg-primary text-primary-foreground' : 'text-ink hover:bg-surface-2'"
            @click="pickMonth(month)"
          >
            {{ month.label }}
          </button>
        </div>

        <div v-else class="mt-2 grid grid-cols-3 gap-1.5">
          <button
            v-for="entry in gridYears"
            :key="entry.year"
            type="button"
            :disabled="entry.disabled"
            class="rounded-md py-2 text-small transition-default disabled:cursor-not-allowed disabled:opacity-30"
            :class="entry.isSelected ? 'bg-primary text-primary-foreground' : 'text-ink hover:bg-surface-2'"
            @click="pickYear(entry)"
          >
            {{ entry.year }}
          </button>
        </div>

        <div v-if="withTime" class="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Icon name="clock" size="15" class="text-ink-faint" />
          <input
            type="time"
            :value="timeValue"
            class="h-9 flex-1 rounded-md border border-border-strong bg-surface px-2.5 text-small text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            @input="onTimeChange"
          />
          <button type="button" class="rounded-md bg-primary p-1.5 text-primary-foreground transition-default hover:opacity-90" @click="close">
            <Icon name="check" size="15" />
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between border-t border-border pt-3">
          <button type="button" class="text-caption font-medium text-primary hover:underline" @click="goToday">
            {{ t('common.today') }}
          </button>
          <button type="button" class="text-caption font-medium text-ink-muted hover:text-ink" @click="clearValue">
            {{ t('common.clear') }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
