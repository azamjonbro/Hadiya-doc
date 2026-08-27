<script setup>
import { ref } from 'vue'
import { onClickOutside } from '@/composables/onClickOutside'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { setLocale, availableLocales } from '@/i18n'
import { useNotifications } from '@/composables/useNotifications'
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

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

function pickLocale(code) {
  setLocale(code)
  localeOpen.value = false
}

const { unreadCount } = useNotifications()
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 lg:px-6">
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        class="hidden rounded-md p-2 text-ink-muted transition-default hover:bg-surface-2 lg:flex"
        @click="ui.toggleSidebar()"
      >
        <Icon name="menu" size="18" />
      </button>
      <div class="min-w-0">
        <p class="truncate text-h3 text-ink">{{ t(route.meta.titleKey || 'nav.dashboard') }}</p>
      </div>
    </div>

    <div class="hidden max-w-md flex-1 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-ink-faint md:flex">
      <Icon name="search" size="16" />
      <input
        type="text"
        :placeholder="t('shell.searchPlaceholder')"
        class="w-full bg-transparent text-small text-ink placeholder:text-ink-faint focus:outline-none"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <div ref="localeRef" class="relative">
        <button
          type="button"
          class="flex h-9 items-center gap-1 rounded-md px-2 text-small font-medium text-ink-muted transition-default hover:bg-surface-2"
          @click="localeOpen = !localeOpen"
        >
          <Icon name="globe" size="17" />
          <span class="uppercase">{{ locale }}</span>
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
        class="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-2"
        @click="theme.toggle()"
      >
        <Icon :name="theme.theme === 'dark' ? 'sun' : 'moon'" size="17" />
      </button>

      <router-link
        to="/notifications"
        class="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-default hover:bg-surface-2"
      >
        <Icon name="bell" size="17" />
        <span v-if="unreadCount > 0" class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
      </router-link>

      <div ref="profileRef" class="relative ml-1">
        <button type="button" class="flex items-center gap-2 rounded-md p-1 transition-default hover:bg-surface-2" @click="profileOpen = !profileOpen">
          <Avatar :name="auth.user?.fullName ?? ''" size="sm" />
        </button>
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 scale-95" leave-active-class="transition-default" leave-to-class="opacity-0 scale-95">
          <div v-if="profileOpen" class="absolute right-0 z-20 mt-2 w-52 rounded-md border border-border bg-surface p-1 shadow-md">
            <div class="px-2.5 py-2">
              <p class="truncate text-small font-medium text-ink">{{ auth.user?.fullName }}</p>
              <p class="truncate text-caption text-ink-faint">{{ auth.user?.email }}</p>
            </div>
            <div class="my-1 border-t border-border" />
            <!-- The mirror of the admin Topbar's way back. /bos is SUPERADMIN
                 only (router guard), so the same gate the Settings page uses
                 decides whether this doorway is even shown. Crossing over is a
                 router push inside one SPA — same session, no re-login. -->
            <router-link
              v-if="auth.isSuperAdmin"
              :to="{ name: 'admin-dashboard' }"
              class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-small text-ink transition-default hover:bg-surface-2"
              @click="profileOpen = false"
            >
              <Icon name="shield" size="15" />
              {{ t('settings.adminPanel.open') }}
            </router-link>
            <router-link to="/settings" class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-small text-ink transition-default hover:bg-surface-2" @click="profileOpen = false">
              <Icon name="settings" size="15" />
              {{ t('nav.settings') }}
            </router-link>
            <button type="button" class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-small text-danger transition-default hover:bg-danger-subtle" @click="onLogout">
              <Icon name="log-out" size="15" />
              {{ t('auth.logout') }}
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>
