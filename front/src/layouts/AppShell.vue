<script setup>
import { useI18n } from 'vue-i18n'
import Topbar from './Topbar.vue'
import BottomNav from './BottomNav.vue'

const { t } = useI18n()

/**
 * The skip link (12.4).
 *
 * `@click.prevent` and an explicit focus rather than letting the browser
 * follow `#main`: the plain anchor scrolls the page but leaves focus where
 * it was, so the next Tab starts from the top of the sidebar again — the
 * exact walk the link exists to skip. Moving focus is the part that
 * matters; `preventDefault` also keeps a `#main` out of every URL, which
 * the router would otherwise carry into the next navigation.
 */
function skipToContent() {
  const main = document.getElementById('main')
  if (!main) return
  main.focus()
  main.scrollIntoView({ block: 'start' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg">
    <!-- First in the tab order, invisible until it is focused. -->
    <a class="skip-link" href="#main" @click.prevent="skipToContent">{{ t('a11y.skipToContent') }}</a>
    <Topbar class="sticky top-0 z-30 w-full" />
    <div class="flex flex-1 min-h-0">
      <!-- `tabindex="-1"` so the skip link can put focus here: a
           landmark is not focusable on its own. -->
      <main
        id="main"
        tabindex="-1"
        class="flex-1 min-w-0 overflow-y-auto pb-20 lg:pb-0 relative focus-visible:outline-none"
      >
        <router-view />
      </main>
    </div>
    <BottomNav class="lg:hidden z-30" />
  </div>
</template>
