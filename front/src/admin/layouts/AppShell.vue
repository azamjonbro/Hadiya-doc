<script setup>
/**
 * The admin shell (rasn/ 2026-09-11): green top bar with a search field in
 * the middle, a 56px icon rail, the section's page list beside it, and the
 * page itself on a white card over the grey ground. The dashboard is the
 * one page drawn straight on the ground — its tiles are the cards.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { sectionFor } from './nav'
import Rail from './Rail.vue'
import SubSidebar from './SubSidebar.vue'
import Topbar from './Topbar.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const section = computed(() => sectionFor(route.path))
const pages = computed(() =>
  (section.value.children ?? []).filter((page) => !page.permission || auth.hasPermission(page.permission)),
)
const showPages = computed(() => pages.value.length > 1)
const plain = computed(() => route.meta.plain === true)

/**
 * The skip link (12.4).
 *
 * `@click.prevent` and an explicit focus rather than letting the browser
 * follow `#main`: the plain anchor scrolls the page but leaves focus where
 * it was, so the next Tab starts from the top of the rail again — the
 * exact walk the link exists to skip.
 */
function skipToContent() {
  const main = document.getElementById('main')
  if (!main) return
  main.focus()
  main.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface-2">
    <a class="skip-link" href="#main" @click.prevent="skipToContent">{{ t('a11y.skipToContent') }}</a>
    <Topbar class="sticky top-0 z-30 w-full" />
    <div class="flex min-h-0 flex-1">
      <Rail class="sticky top-16 hidden h-[calc(100vh-4rem)] lg:flex" />
      <SubSidebar v-if="showPages" :section="section" :pages="pages" class="sticky top-16 hidden h-[calc(100vh-4rem)] lg:block" />
      <!-- `tabindex="-1"` so the skip link can put focus here: a landmark
           is not focusable on its own. -->
      <main id="main" tabindex="-1" class="relative min-w-0 flex-1 overflow-y-auto pb-20 focus-visible:outline-none lg:pb-4" :class="plain ? '' : 'p-2 lg:pr-4'">
        <div :class="plain ? '' : 'min-h-[calc(100vh-6rem)] rounded-2xl bg-surface shadow-sm'">
          <router-view />
        </div>
      </main>
    </div>
  </div>
</template>
