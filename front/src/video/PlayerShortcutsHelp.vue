<script setup>
/**
 * The list of keyboard shortcuts (12.5).
 *
 * Shortcuts nobody knows about are shortcuts nobody uses, so there is a
 * `?` and a button that opens this. Deliberately a plain panel rather than
 * a modal: it does not take focus, so somebody can read it and press the
 * keys while it is open.
 */
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'

defineProps({ open: { type: Boolean, default: false } })
defineEmits(['close'])

const { t } = useI18n()

// Grouped the way somebody looks for them, not by key code.
const GROUPS = [
  {
    titleKey: 'player.help.playback',
    rows: [
      { keys: ['Space', 'K'], labelKey: 'player.help.togglePlay' },
      { keys: ['J', '←'], labelKey: 'player.help.back' },
      { keys: ['L', '→'], labelKey: 'player.help.forward' },
      { keys: ['0', '…', '9'], labelKey: 'player.help.jump' },
      { keys: ['Home', 'End'], labelKey: 'player.help.edges' },
      { keys: ['<', '>'], labelKey: 'player.help.speed' },
    ],
  },
  {
    titleKey: 'player.help.soundAndView',
    rows: [
      { keys: ['↑', '↓'], labelKey: 'player.help.volume' },
      { keys: ['M'], labelKey: 'player.help.mute' },
      { keys: ['C'], labelKey: 'player.help.captions' },
      { keys: ['F'], labelKey: 'player.help.fullscreen' },
      { keys: ['?'], labelKey: 'player.help.thisPanel' },
    ],
  },
]
</script>

<template>
  <div
    v-if="open"
    class="absolute inset-x-3 bottom-16 z-20 rounded-lg border border-white/15 bg-black/85 p-4 text-white shadow-lg backdrop-blur-sm"
    role="region"
    :aria-label="t('player.help.title')"
  >
    <div class="flex items-start gap-2">
      <p class="min-w-0 flex-1 text-small font-medium">{{ t('player.help.title') }}</p>
      <button
        type="button"
        class="rounded p-1 text-white/70 transition-default hover:bg-white/10 hover:text-white"
        :aria-label="t('common.close')"
        @click="$emit('close')"
      >
        <Icon name="close" size="14" />
      </button>
    </div>

    <div class="mt-3 grid gap-4 sm:grid-cols-2">
      <div v-for="group in GROUPS" :key="group.titleKey">
        <p class="text-caption uppercase tracking-wide text-white/50">{{ t(group.titleKey) }}</p>
        <ul class="mt-1.5 space-y-1">
          <li v-for="row in group.rows" :key="row.labelKey" class="flex items-center gap-2 text-caption">
            <span class="flex shrink-0 items-center gap-1">
              <kbd
                v-for="key in row.keys"
                :key="key"
                class="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px]"
              >
                {{ key }}
              </kbd>
            </span>
            <span class="min-w-0 text-white/80">{{ t(row.labelKey) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
