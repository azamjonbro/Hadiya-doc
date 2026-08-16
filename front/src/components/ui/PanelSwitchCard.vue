<script setup>
// The doorway between the employee side and the admin side, used from both
// Settings pages. One component rather than two blocks of near-identical
// markup, because the two directions differ only in wording and icon — and
// keeping them together is what stops them drifting apart visually.
//
// Crossing over is a router push inside one SPA: same session, same tokens,
// no re-login. The copy says so, because a button labelled "admin panel" in a
// corporate app otherwise looks like it is about to ask for a password.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppButton from './AppButton.vue'
import Icon from './Icon.vue'

const props = defineProps({
  // 'admin' — go to the admin panel; 'user' — come back to the employee side.
  direction: { type: String, default: 'admin' },
})

const { t } = useI18n()
const router = useRouter()

const toAdmin = computed(() => props.direction === 'admin')
const icon = computed(() => (toAdmin.value ? 'shield' : 'home'))
const target = computed(() => (toAdmin.value ? { name: 'admin-dashboard' } : { name: 'dashboard' }))
const title = computed(() => t(toAdmin.value ? 'settings.adminPanel.title' : 'settings.adminPanel.userTitle'))
const hint = computed(() => t(toAdmin.value ? 'settings.adminPanel.hint' : 'settings.adminPanel.userHint'))
const action = computed(() => t(toAdmin.value ? 'settings.adminPanel.open' : 'settings.adminPanel.backToUser'))
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-lg border border-primary/25 bg-surface p-5 transition-default hover:border-primary/40"
  >
    <!-- Tint and glow, both decorative: pointer-events-none so they can never
         swallow a click meant for the button. -->
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-subtle via-transparent to-transparent" />
    <div
      class="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl transition-default group-hover:bg-primary/[0.18]"
    />

    <div class="relative flex items-start gap-4">
      <!-- Same inset sheen the primary button uses, so the tile reads as part
           of the same surface family rather than a flat coloured square. -->
      <span
        class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/90 text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.22),0_6px_20px_-6px_rgb(var(--color-primary)/0.5)]"
      >
        <Icon :name="icon" size="20" />
      </span>

      <div class="min-w-0 flex-1">
        <h2 class="text-body font-semibold text-ink">{{ title }}</h2>
        <p class="mt-1 text-caption leading-relaxed text-ink-faint">{{ hint }}</p>
      </div>

      <AppButton class="shrink-0" icon="arrow-right" icon-position="right" @click="router.push(target)">
        {{ action }}
      </AppButton>
    </div>
  </div>
</template>
