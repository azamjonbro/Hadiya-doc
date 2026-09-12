<script setup>
import { useBrandingStore } from '@/stores/branding'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { setLocale, availableLocales } from '@/i18n'
import { useNotifications } from '@/composables/useNotifications'
import { onClickOutside } from '@/composables/onClickOutside'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t, locale } = useI18n()
const branding = useBrandingStore()
const router = useRouter()
const theme = useThemeStore()
const auth = useAuthStore()

const profileOpen = ref(false)
const profileRef = ref(null)
onClickOutside(profileRef, () => (profileOpen.value = false))

// The field is a button: the real search is the command palette, which
// already knows every entity type. One place to search, not two.
function openSearch() {
  window.dispatchEvent(new CustomEvent('lms:search'))
}

const { unreadCount } = useNotifications()

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

function pickLocale(code) {
  setLocale(code)
}
</script>

<template>
  <!-- Rasm 2: wordmark flush left, a translucent search field in the
       middle, chat · bell · apps · avatar on the right. Language and theme
       moved into the avatar menu — the reference bar carries four circles. -->
  <header class="flex h-16 w-full shrink-0 items-center bg-primary text-primary-foreground">
    <router-link
      to="/bos"
      class="flex h-16 shrink-0 items-center pl-3 pr-6 text-[34px] font-black uppercase leading-none tracking-tighter text-white transition-opacity hover:opacity-90"
    >
      <img v-if="branding.logoUrl" :src="branding.logoUrl" :alt="branding.appName || t('portal.brand')" class="h-9 max-w-[180px] object-contain" />
      <template v-else>{{ branding.appName || t('portal.brand') }}</template>
    </router-link>

    <div class="flex flex-1 justify-center px-4">
      <button
        type="button"
        class="flex h-10 w-full max-w-[560px] items-center gap-3 rounded-full bg-white/20 px-4 text-left text-[14px] text-white/80 transition-default hover:bg-white/25"
        @click="openSearch"
      >
        <Icon name="search" size="18" />
        <span class="truncate">{{ t('search.placeholder') }}</span>
        <kbd class="ml-auto hidden rounded bg-white/15 px-1.5 py-0.5 text-[11px] text-white/70 sm:inline">⌘K</kbd>
      </button>
    </div>

    <div class="flex items-center gap-3 pr-4">
      <router-link
        v-if="auth.hasPermission('chat:support')"
        to="/bos/chat"
        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="t('nav.chat')"
      >
        <Icon name="message-square" size="17" />
      </router-link>
      <router-link
        to="/bos/notifications"
        class="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="unreadCount > 0 ? t('a11y.notificationsUnread', { count: unreadCount }) : t('nav.notifications')"
      >
        <Icon name="bell" size="17" />
        <span
          v-if="unreadCount > 0"
          class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-primary bg-white px-1 text-[10px] font-bold text-primary"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </router-link>
      <router-link
        to="/"
        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="t('settings.adminPanel.backToUser')"
      >
        <Icon name="grid" size="17" />
      </router-link>

      <div ref="profileRef" class="relative">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-transparent transition-default hover:border-white/60"
          :aria-label="t('a11y.userMenu', { name: auth.user?.fullName ?? '' })"
          aria-haspopup="menu"
          :aria-expanded="profileOpen"
          @click="profileOpen = !profileOpen"
        >
          <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar ?? ''" size="sm" class="h-8 w-8" />
        </button>
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 scale-95" leave-active-class="transition-default" leave-to-class="opacity-0 scale-95">
          <div v-if="profileOpen" class="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-border bg-surface p-1 text-ink shadow-md">
            <div class="px-3 py-2.5">
              <p class="truncate text-small font-semibold text-ink">{{ auth.user?.fullName }}</p>
              <p class="mt-0.5 truncate text-caption text-ink-muted">{{ auth.user?.email }}</p>
            </div>
            <div class="my-1 border-t border-border" />
            <router-link to="/" class="flex items-center gap-2 rounded px-3 py-2 text-small text-ink transition-default hover:bg-surface-2" @click="profileOpen = false">
              <Icon name="home" size="15" />
              {{ t('settings.adminPanel.backToUser') }}
            </router-link>
            <router-link to="/bos/settings" class="flex items-center gap-2 rounded px-3 py-2 text-small text-ink transition-default hover:bg-surface-2" @click="profileOpen = false">
              <Icon name="settings" size="15" />
              {{ t('nav.settings') }}
            </router-link>
            <div class="my-1 border-t border-border" />
            <div class="flex items-center justify-between px-3 py-1.5">
              <span class="text-caption text-ink-muted">{{ t('a11y.language') }}</span>
              <div class="flex gap-1">
                <button
                  v-for="code in availableLocales"
                  :key="code"
                  type="button"
                  class="rounded px-1.5 py-0.5 text-[11px] uppercase transition-default"
                  :class="locale === code ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-2'"
                  @click="pickLocale(code)"
                >{{ code }}</button>
              </div>
            </div>
            <button type="button" class="flex w-full items-center gap-2 rounded px-3 py-2 text-small text-ink transition-default hover:bg-surface-2" @click="theme.toggle()">
              <Icon :name="theme.theme === 'dark' ? 'sun' : 'moon'" size="15" />
              {{ theme.theme === 'dark' ? t('a11y.themeLight') : t('a11y.themeDark') }}
            </button>
            <button type="button" class="mt-1 flex w-full items-center gap-2 rounded px-3 py-2 text-small text-danger transition-default hover:bg-danger/10" @click="onLogout">
              <Icon name="log-out" size="15" />
              {{ t('auth.logout') }}
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>
