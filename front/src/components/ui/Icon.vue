<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 1.75 },
})

// A small, self-authored icon system (no external icon package). Every icon
// shares a 24x24 grid, rounded caps/joins and a uniform stroke weight so the
// set reads as one consistent language across the product.
const icons = {
  menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
  close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  'chevron-up': '<polyline points="6 15 12 9 18 15"/>',
  'chevron-left': '<polyline points="15 6 9 12 15 18"/>',
  'chevron-right': '<polyline points="9 6 15 12 9 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><line x1="20" y1="20" x2="15.8" y2="15.8"/>',
  bell: '<path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13.5 6 9.5Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="4.9" y1="4.9" x2="6.7" y2="6.7"/><line x1="17.3" y1="17.3" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="6.7" y2="17.3"/><line x1="17.3" y1="6.7" x2="19.1" y2="4.9"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="3.6" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>',
  home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M5.5 9.5V19a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1V9.5"/>',
  'book-open': '<path d="M12 6.5c-1.6-1.2-4-1.7-6.5-1.5v12c2.5-.2 4.9.3 6.5 1.5 1.6-1.2 4-1.7 6.5-1.5v-12c-2.5-.2-4.9.3-6.5 1.5Z"/><line x1="12" y1="6.5" x2="12" y2="18.5"/>',
  newspaper: '<rect x="3.5" y="5.5" width="13" height="13" rx="1.5"/><path d="M16.5 8.5H20a.5.5 0 0 1 .5.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5"/><line x1="6.5" y1="9" x2="13" y2="9"/><line x1="6.5" y1="12" x2="13" y2="12"/><line x1="6.5" y1="15" x2="10.5" y2="15"/>',
  'check-square': '<rect x="4" y="4" width="16" height="16" rx="3"/><polyline points="8 12.5 11 15.5 16.5 9"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3.5" x2="8" y2="7"/><line x1="16" y1="3.5" x2="16" y2="7"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.7-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><circle cx="17" cy="8.5" r="2.6"/><path d="M15.5 14.6c2.2.3 3.7 1.8 4.2 4.4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19c.8-3.4 3.2-5.2 7-5.2s6.2 1.8 7 5.2"/>',
  'bar-chart': '<line x1="5" y1="19.5" x2="5" y2="12"/><line x1="12" y1="19.5" x2="12" y2="6"/><line x1="19" y1="19.5" x2="19" y2="15"/><line x1="3" y1="19.5" x2="21" y2="19.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8 6.3 6.3"/>',
  shield: '<path d="M12 3.5 19 6v6c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V6Z"/><polyline points="9 12 11 14 15.5 9.5"/>',
  'log-out': '<path d="M9.5 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3.5"/><line x1="20" y1="12" x2="10.5" y2="12"/><polyline points="16 8 20 12 16 16"/>',
  play: '<polygon points="8 5.5 19 12 8 18.5"/>',
  pause: '<line x1="8.5" y1="5" x2="8.5" y2="19"/><line x1="15.5" y1="5" x2="15.5" y2="19"/>',
  volume: '<polygon points="4 9.5 8.5 9.5 13 5.5 13 18.5 8.5 14.5 4 14.5"/><path d="M16.5 9.2a4 4 0 0 1 0 5.6"/>',
  maximize: '<polyline points="9 4.5 4.5 4.5 4.5 9"/><polyline points="15 4.5 19.5 4.5 19.5 9"/><polyline points="9 19.5 4.5 19.5 4.5 15"/><polyline points="15 19.5 19.5 19.5 19.5 15"/>',
  minimize: '<polyline points="4.5 9 9 9 9 4.5"/><polyline points="19.5 9 15 9 15 4.5"/><polyline points="4.5 15 9 15 9 19.5"/><polyline points="19.5 15 15 15 15 19.5"/>',
  check: '<polyline points="4.5 12.5 9.5 17.5 19.5 6.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><polyline points="8 12.3 11 15.3 16 9.3"/>',
  'alert-triangle': '<path d="M12 4.5 21 19.5H3Z"/><line x1="12" y1="10" x2="12" y2="14.2"/><circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="none"/>',
  'alert-circle': '<circle cx="12" cy="12" r="8.5"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.2" r="0.15" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.15" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><polyline points="12 7 12 12 15.5 14"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  'arrow-right': '<line x1="4.5" y1="12" x2="19" y2="12"/><polyline points="13.5 6.5 19 12 13.5 17.5"/>',
  'arrow-left': '<line x1="19.5" y1="12" x2="5" y2="12"/><polyline points="10.5 6.5 5 12 10.5 17.5"/>',
  upload: '<path d="M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3"/><polyline points="8 8.5 12 4.5 16 8.5"/><line x1="12" y1="4.5" x2="12" y2="15"/>',
  download: '<path d="M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3"/><polyline points="8 11 12 15 16 11"/><line x1="12" y1="4.5" x2="12" y2="15"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'more-horizontal': '<circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  trash: '<path d="M5 7.5h14"/><path d="M9.5 7.5V5.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7.5"/><path d="M7 7.5 7.8 19a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7.5"/>',
  pencil: '<path d="M15.5 5.5 18.5 8.5 8.2 18.8 4.8 19.2l.4-3.4Z"/>',
  filter: '<polygon points="4 5 20 5 14 12.5 14 18 10 19.5 10 12.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  list: '<line x1="9" y1="6.5" x2="20" y2="6.5"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="17.5" x2="20" y2="17.5"/><circle cx="4.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  star: '<polygon points="12 4 14.6 9.7 21 10.4 16.3 14.6 17.6 21 12 17.7 6.4 21 7.7 14.6 3 10.4 9.4 9.7"/>',
  'trending-up': '<polyline points="4 16 10 10 14 14 20 7"/><polyline points="14.5 7 20 7 20 12.5"/>',
  'trending-down': '<polyline points="4 8 10 14 14 10 20 17"/><polyline points="20 11.5 20 17 14.5 17"/>',
  video: '<rect x="3.5" y="6.5" width="12" height="11" rx="2"/><path d="M15.5 10.5 20 8v8l-4.5-2.5Z"/>',
  'file-text': '<path d="M7 4.5h7l4 4v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15.5" x2="15" y2="15.5"/>',
  'map-pin': '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M4 4l16 16"/><path d="M10.6 5.7A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3.3 4M7.2 7.3C4.4 8.9 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.6-.8"/><path d="M9.9 10.1a3 3 0 0 0 4.1 4.1"/>',
  loader: '<path d="M12 3.5v3.2"/><path d="M12 17.3v3.2" opacity="0.3"/><path d="M6.3 6.3l2.3 2.3" opacity="0.85"/><path d="M15.4 15.4l2.3 2.3" opacity="0.3"/><path d="M3.5 12h3.2" opacity="0.7"/><path d="M17.3 12h3.2" opacity="0.45"/><path d="M6.3 17.7l2.3-2.3" opacity="0.55"/><path d="M15.4 8.6l2.3-2.3" opacity="0.15"/>',
  building: '<rect x="5" y="3.5" width="10" height="17" rx="1"/><line x1="8" y1="7" x2="8" y2="7.01"/><line x1="12" y1="7" x2="12" y2="7.01"/><line x1="8" y1="10.5" x2="8" y2="10.51"/><line x1="12" y1="10.5" x2="12" y2="10.51"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><path d="M15 9.5h3.5a1 1 0 0 1 1 1V20"/><path d="M9.5 20.5V17h1v3.5"/>',
  award: '<circle cx="12" cy="9" r="5"/><polyline points="9 13.5 7.5 20.5 12 18 16.5 20.5 15 13.5"/>',
  flame: '<path d="M12 3s3.5 3 3.5 6.5a3.5 3.5 0 0 1-1 2.5c1.6-.3 3-1.9 3-3.7 1.6 2 2 4 2 5.7A6.5 6.5 0 0 1 12.9 21 6.4 6.4 0 0 1 6.5 14.6c0-2.7 1.7-4.3 2.6-6 .5.9.9 1.9.9 3 0-3.6 1-6.4 2-8.6Z"/>',
  send: '<line x1="20.5" y1="3.5" x2="10.5" y2="13.5"/><polygon points="20.5 3.5 14 20.5 10.5 13.5 3.5 10 20.5 3.5"/>',
  paperclip: '<path d="M8 12.5 15 5.5a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7-7l7.8-7.8"/>',
  'message-square': '<path d="M4 5.5h16v10.5H9l-4 3.5v-3.5H4Z"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11.2 7.8l1.6-1.6a3.6 3.6 0 0 1 5.1 5.1l-1.7 1.7"/><path d="M12.8 16.2l-1.6 1.6a3.6 3.6 0 0 1-5.1-5.1l1.7-1.7"/>',
  refresh: '<path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5"/><polyline points="17.5 3 17.5 7 13.5 7"/><path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5"/><polyline points="6.5 21 6.5 17 10.5 17"/>',
  layers: '<polygon points="12 3.5 21 8.5 12 13.5 3 8.5"/><polyline points="3 13 12 18 21 13"/><polyline points="3 17.5 12 22.5 21 17.5"/>',
  activity: '<polyline points="3.5 12.5 8 12.5 10 6.5 14 18.5 16 12.5 20.5 12.5"/>',
  'graduation-cap': '<path d="M2.5 9.5 12 5l9.5 4.5L12 14Z"/><path d="M6.5 11.5V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.5"/><line x1="21.5" y1="9.5" x2="21.5" y2="15.5"/>',
  briefcase: '<rect x="3.5" y="8" width="17" height="11" rx="1.8"/><path d="M8.5 8V6a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 6v2"/><line x1="3.5" y1="12.5" x2="20.5" y2="12.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="18" x2="12" y2="21"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="m4.5 17 4.2-4.2a1.5 1.5 0 0 1 2.1 0L16 17.5"/><path d="m14 15 1.6-1.6a1.5 1.5 0 0 1 2.1 0l1.8 1.8"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  bold: '<path d="M7.5 5h5.2a3.5 3.5 0 0 1 0 7H7.5Z"/><path d="M7.5 12h6a3.5 3.5 0 0 1 0 7h-6Z"/>',
  italic: '<line x1="14.5" y1="5" x2="19" y2="5"/><line x1="5" y1="19" x2="9.5" y2="19"/><line x1="14.5" y1="5" x2="9.5" y2="19"/>',
  code: '<polyline points="8.5 8 4.5 12 8.5 16"/><polyline points="15.5 8 19.5 12 15.5 16"/>',
  quote: '<path d="M9 6.5c-2.5 1-4 3.2-4 6V17h5v-5H7c0-1.9.7-3.4 2-4.2Z"/><path d="M19 6.5c-2.5 1-4 3.2-4 6V17h5v-5h-3c0-1.9.7-3.4 2-4.2Z"/>',
  'check-check': '<polyline points="2.5 12.5 6.5 16.5 14 8"/><polyline points="10 14.5 12 16.5 21.5 6.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.2 4.2 0 0 0 7 0"/><circle cx="9.3" cy="10" r="0.2" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r="0.2" fill="currentColor" stroke="none"/>',
  'user-plus': '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19c.8-3.4 3-5.2 6.5-5.2 1 0 1.9.15 2.7.44"/><line x1="18" y1="12" x2="18" y2="18"/><line x1="15" y1="15" x2="21" y2="15"/>',
  'wifi-off': '<line x1="4" y1="4" x2="20" y2="20"/><path d="M8.2 15.3a5.5 5.5 0 0 1 7-.6"/><path d="M5 11.6a10.5 10.5 0 0 1 4.2-2.4"/><path d="M14.5 9.4a10.5 10.5 0 0 1 4.5 2.2"/><circle cx="12" cy="18.6" r="0.2" fill="currentColor" stroke="none"/>',
}

// An unknown name renders an empty <svg>: a 20px hole where an icon should
// be, with nothing anywhere saying why. Eight wrong names reached a review
// that way, so development says so out loud. Production still renders the
// gap rather than throwing — a typo in an icon name must not take a page
// down.
const markup = computed(() => {
  const found = icons[props.name]
  if (!found && import.meta.env.DEV) {
    console.warn(`[Icon] no icon named "${props.name}" — it will render as an empty box`)
  }
  return found ?? ''
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="shrink-0"
    aria-hidden="true"
    v-html="markup"
  />
</template>
