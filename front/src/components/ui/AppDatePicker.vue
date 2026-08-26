<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  error: { type: String, default: '' },
  hint: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  withTime: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t, locale } = useI18n()

// Chromium's bundled ICU data is incomplete for 'uz' (named month/weekday
// fields silently fall back to a generic "2026 M08" skeleton instead of an
// actual month name) — so calendar labels are hardcoded per locale here
// rather than trusted to `Intl.DateTimeFormat`, which only reliably handles
// pure-numeric fields across all three locales this app ships.
const MONTH_NAMES = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}
const WEEKDAY_SHORT = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Parses the `yyyy-mm-dd[Thh:mm]` value manually into local-time components —
// `new Date(isoString)` treats a date-only string as UTC midnight, which can
// shift the displayed day near midnight outside UTC.
function parseValue(value) {
  if (!value) return null
  const [datePart, timePart] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  if (timePart) {
    const [h, min] = timePart.split(':').map(Number)
    return new Date(y, m - 1, d, h || 0, min || 0)
  }
  return new Date(y, m - 1, d)
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function toISOValue(date) {
  const base = toISODate(date)
  return props.withTime ? `${base}T${pad2(date.getHours())}:${pad2(date.getMinutes())}` : base
}

const selected = computed(() => parseValue(props.modelValue))

const open = ref(false)
const rootEl = ref(null)
const popupEl = ref(null)
// Decided fresh each time the popup opens, from the trigger's actual position
// in the viewport — a modal has no room to grow, so a popup that always drops
// down-right will get clipped whenever the field sits near the modal's edge.
const openUp = ref(false)
const alignRight = ref(false)
const viewDate = ref(selected.value ?? new Date())
const timeValue = ref(selected.value ? `${pad2(selected.value.getHours())}:${pad2(selected.value.getMinutes())}` : '12:00')

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseValue(value)
    if (parsed) {
      viewDate.value = parsed
      timeValue.value = `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
    }
  }
)

const displayText = computed(() => {
  if (!selected.value) return ''
  const datePart = `${pad2(selected.value.getDate())}.${pad2(selected.value.getMonth() + 1)}.${selected.value.getFullYear()}`
  return props.withTime ? `${datePart} ${pad2(selected.value.getHours())}:${pad2(selected.value.getMinutes())}` : datePart
})

const monthNames = computed(() => MONTH_NAMES[locale.value] ?? MONTH_NAMES.en)
const monthLabel = computed(() => `${monthNames.value[viewDate.value.getMonth()]} ${viewDate.value.getFullYear()}`)

// Monday-first weekday short labels
const weekdayLabels = computed(() => WEEKDAY_SHORT[locale.value] ?? WEEKDAY_SHORT.en)

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

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
    }
  })
})

function prevMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1)
}
function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1)
}

function pickDay(day) {
  const [h, min] = props.withTime ? timeValue.value.split(':').map(Number) : [0, 0]
  const next = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), h || 0, min || 0)
  emit('update:modelValue', toISOValue(next))
  if (!props.withTime) open.value = false
}

function onTimeChange(event) {
  timeValue.value = event.target.value
  if (!selected.value) return
  const [h, min] = timeValue.value.split(':').map(Number)
  const next = new Date(selected.value.getFullYear(), selected.value.getMonth(), selected.value.getDate(), h || 0, min || 0)
  emit('update:modelValue', toISOValue(next))
}

function goToday() {
  const today = new Date()
  viewDate.value = today
  if (props.withTime) {
    const [h, min] = timeValue.value.split(':').map(Number)
    emit('update:modelValue', toISOValue(new Date(today.getFullYear(), today.getMonth(), today.getDate(), h || 0, min || 0)))
  } else {
    emit('update:modelValue', toISODate(today))
    open.value = false
  }
}

function clearValue() {
  emit('update:modelValue', '')
  open.value = false
}

async function toggleOpen() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    viewDate.value = selected.value ?? new Date()
    await nextTick()
    positionPopup()
  }
}

function positionPopup() {
  const trigger = rootEl.value
  const popup = popupEl.value
  if (!trigger || !popup) return
  const triggerRect = trigger.getBoundingClientRect()
  const popupRect = popup.getBoundingClientRect()
  openUp.value =
    triggerRect.bottom + popupRect.height > window.innerHeight && triggerRect.top - popupRect.height > 0
  alignRight.value = triggerRect.left + popupRect.width > window.innerWidth
}

function onClickOutside(event) {
  if (rootEl.value && !rootEl.value.contains(event.target)) open.value = false
}
function onKeydown(event) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})

const inputId = `datepicker-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div ref="rootEl" class="relative">
    <label v-if="label" :for="inputId" class="mb-1.5 block text-small font-medium text-ink">
      {{ label }}
      <span v-if="required" class="text-danger">*</span>
    </label>
    <div class="relative">
      <button
        :id="inputId"
        type="button"
        :disabled="disabled"
        class="flex h-10.5 w-full items-center rounded-md border bg-surface pl-10 pr-3.5 text-left text-body outline-none transition-default disabled:opacity-50"
        :class="error ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/15' : 'border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/15'"
        @click="toggleOpen"
      >
        <Icon name="calendar" size="17" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <span :class="displayText ? 'text-ink' : 'text-ink-faint'">{{ displayText || placeholder }}</span>
      </button>
      <button
        v-if="modelValue"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted"
        tabindex="-1"
        @click.stop="clearValue"
      >
        <Icon name="close" size="15" />
      </button>

      <!-- Visually hidden, kept in sync with modelValue so the surrounding
           <form>'s native required/constraint validation still fires even
           though the visible trigger is a button, not a real form control. -->
      <input :type="withTime ? 'datetime-local' : 'date'" :required="required" :value="modelValue" tabindex="-1" aria-hidden="true" class="sr-only" />

      <div
        v-if="open"
        ref="popupEl"
        class="absolute z-20 w-72 rounded-md border border-border bg-surface p-3 text-small shadow-md"
        :class="[openUp ? 'bottom-full mb-1' : 'top-full mt-1', alignRight ? 'right-0' : 'left-0']"
      >
        <div class="flex items-center justify-between">
          <button type="button" class="rounded-md p-1.5 text-ink-muted transition-default hover:bg-surface-2" @click="prevMonth">
            <Icon name="chevron-left" size="16" />
          </button>
          <p class="font-medium capitalize text-ink">{{ monthLabel }}</p>
          <button type="button" class="rounded-md p-1.5 text-ink-muted transition-default hover:bg-surface-2" @click="nextMonth">
            <Icon name="chevron-right" size="16" />
          </button>
        </div>

        <div class="mt-2 grid grid-cols-7 gap-1 text-center text-caption text-ink-faint">
          <span v-for="(wd, i) in weekdayLabels" :key="i" class="capitalize">{{ wd }}</span>
        </div>
        <div class="mt-1 grid grid-cols-7 gap-1">
          <button
            v-for="(day, i) in gridDays"
            :key="i"
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md text-small transition-default"
            :class="[
              day.isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-2',
              !day.isSelected && day.isToday ? 'border border-primary/50 text-primary' : '',
              !day.isSelected && !day.isToday ? (day.inMonth ? 'text-ink' : 'text-ink-faint') : '',
            ]"
            @click="pickDay(day)"
          >
            {{ day.date.getDate() }}
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
          <button type="button" class="rounded-md bg-primary p-1.5 text-primary-foreground transition-default hover:bg-primary-hover" @click="open = false">
            <Icon name="check" size="15" />
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between border-t border-border pt-3">
          <button type="button" class="text-caption font-medium text-primary hover:underline" @click="goToday">{{ t('common.today') }}</button>
          <button type="button" class="text-caption font-medium text-ink-muted hover:text-ink" @click="clearValue">{{ t('common.clear') }}</button>
        </div>
      </div>
    </div>
    <p v-if="error" class="mt-1.5 text-small text-danger">{{ error }}</p>
    <p v-else-if="hint" class="mt-1.5 text-small text-ink-faint">{{ hint }}</p>
  </div>
</template>
