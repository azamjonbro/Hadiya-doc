<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { setLocale, availableLocales } from '@/i18n'
import { useNotifications } from '@/composables/useNotifications'
import { onClickOutside } from '@/composables/onClickOutside'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const theme = useThemeStore()
const auth = useAuthStore()
const ui = useUiStore()

const profileOpen = ref(false)
const localeOpen = ref(false)
const profileRef = ref(null)
const localeRef = ref(null)
onClickOutside(profileRef, () => (profileOpen.value = false))
onClickOutside(localeRef, () => (localeOpen.value = false))

const { unreadCount } = useNotifications()

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

function pickLocale(code) {
  setLocale(code)
  localeOpen.value = false
}
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between gap-4 bg-primary px-6 w-full text-primary-foreground shadow-sm">
    <div class="flex min-w-0 items-center gap-6">
      <div class="flex items-center gap-2.5">
        <router-link to="/bos" class="text-[32px] font-black tracking-tighter uppercase text-white hover:opacity-90 transition-opacity">
          {{ t('portal.brand') }}
        </router-link>
        <span class="text-primary text-caption bg-white px-2 py-0.5 rounded-full ml-2 font-bold hidden sm:block">ADMIN</span>
      </div>
      
      <div class="h-6 w-px bg-white/20 hidden lg:block"></div>
      
      <button
        type="button"
        class="hidden rounded-md p-2 text-white/80 transition-default hover:bg-white/10 hover:text-white lg:flex"
        :aria-label="t('a11y.toggleSidebar')"
        :aria-expanded="!ui.sidebarCollapsed"
        aria-controls="main-nav"
        @click="ui.toggleSidebar()"
      >
        <Icon name="menu" size="18" />
      </button>
      <div class="min-w-0 hidden lg:block">
        <p class="truncate text-h3 text-white font-semibold">{{ t(route.meta.titleKey || 'nav.dashboard') }}</p>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <div ref="localeRef" class="relative">
        <button
          type="button"
          class="flex h-9 items-center gap-1 rounded-md px-2 text-small font-medium text-white/80 transition-default hover:bg-white/10 hover:text-white"
          :aria-label="t('a11y.language')"
          aria-haspopup="menu"
          :aria-expanded="localeOpen"
          @click="localeOpen = !localeOpen"
        >
          <Icon name="globe" size="17" />
          <span class="hidden uppercase sm:inline">{{ locale }}</span>
        </button>
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 scale-95" leave-active-class="transition-default" leave-to-class="opacity-0 scale-95">
          <div v-if="localeOpen" class="absolute right-0 z-20 mt-2 w-32 rounded-md border border-border bg-surface p-1 shadow-md">
            <button
              v-for="code in availableLocales"
              :key="code"
              type="button"
              class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-small text-ink transition-default hover:bg-surface-2"
              @click="pickLocale(code)"
            >
              {{ t('locales.' + code) }}
              <Icon v-if="locale === code" name="check" size="14" class="text-primary" />
            </button>
          </div>
        </Transition>
      </div>

      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-default hover:bg-white/10 hover:text-white"
        :aria-label="theme.theme === 'dark' ? t('a11y.themeLight') : t('a11y.themeDark')"
        @click="theme.toggle()"
      >
        <Icon :name="theme.theme === 'dark' ? 'sun' : 'moon'" size="17" />
      </button>

      <router-link
        to="/bos/notifications"
        class="relative flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-default hover:bg-white/10 hover:text-white"
        :aria-label="unreadCount > 0 ? t('a11y.notificationsUnread', { count: unreadCount }) : t('nav.notifications')"
      >
        <Icon name="bell" size="17" />
        <span v-if="unreadCount > 0" aria-hidden="true" class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white/20" />
      </router-link>

      <div ref="profileRef" class="relative ml-1">
        <button
          type="button"
          class="flex items-center gap-2.5 rounded px-2 py-1 transition-default hover:bg-white/10"
          :aria-label="t('a11y.userMenu', { name: auth.user?.fullName ?? '' })"
          aria-haspopup="menu"
          :aria-expanded="profileOpen"
          @click="profileOpen = !profileOpen"
        >
          <Avatar :name="auth.user?.fullName ?? ''" size="sm" class="border border-white/30 rounded" />
          <div class="hidden text-left lg:block max-w-[120px]">
            <p class="truncate text-[13px] font-semibold text-white leading-tight">{{ auth.user?.fullName }}</p>
          </div>
          <Icon name="chevron-down" size="14" class="text-white/70 hidden lg:block" />
        </button>
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 scale-95" leave-active-class="transition-default" leave-to-class="opacity-0 scale-95">
          <div v-if="profileOpen" class="absolute right-0 z-20 mt-2 w-56 rounded border border-border bg-surface p-1 shadow-sm">
            <div class="px-3 py-2.5">
              <p class="truncate text-small font-semibold text-ink">{{ auth.user?.fullName }}</p>
              <p class="truncate text-caption text-ink-muted mt-0.5">{{ auth.user?.email }}</p>
            </div>
            <div class="my-1 border-t border-border" />
            <!-- The way back. Same session, same tokens — this is a router
                 push inside one SPA, so nothing is re-authenticated. -->
            <router-link to="/" class="flex items-center gap-2 rounded px-3 py-2 text-small text-ink transition-default hover:bg-surface-2" @click="profileOpen = false">
              <Icon name="home" size="15" />
              {{ t('settings.adminPanel.backToUser') }}
            </router-link>
            <router-link to="/bos/settings" class="flex items-center gap-2 rounded px-3 py-2 text-small text-ink transition-default hover:bg-surface-2" @click="profileOpen = false">
              <Icon name="settings" size="15" />
              {{ t('nav.settings') }}
            </router-link>
            <button type="button" class="flex w-full items-center gap-2 rounded px-3 py-2 text-small text-danger transition-default hover:bg-danger/10 mt-1" @click="onLogout">
              <Icon name="log-out" size="15" />
              {{ t('auth.logout') }}
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>
