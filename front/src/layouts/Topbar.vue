<script setup>
/**
 * The portal's top bar (docs/v4/06-learner-portal-reference.md §0, §12).
 *
 * One bar for every page: wordmark left, five links in the middle with a
 * "···" panel for the rest, and a cluster of round buttons on the right
 * that open drawers rather than pages — notifications, messages and the
 * profile are things a person glances at from wherever they are, and a
 * full navigation for each would throw away the page they were on.
 *
 * Links whose route does not exist yet are filtered out here rather than
 * left as 404s: the nav config names the whole portal, the router says
 * which parts are built.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { onClickOutside } from '@/composables/onClickOutside'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useNotifications } from '@/composables/useNotifications'
import { portalMenuGroups } from './nav'
import { useBrandingStore } from '@/stores/branding'
import NotificationsDrawer from './NotificationsDrawer.vue'
import BirthdaysDrawer from './BirthdaysDrawer.vue'
import ChatDrawer from './ChatDrawer.vue'
import ProfileDrawer from './ProfileDrawer.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()
const { items: notificationItems, unreadCount, markRead, markAllRead } = useNotifications()

function routeExists(path) {
  const resolved = router.resolve(path)
  return resolved.matched.length > 0 && resolved.name !== 'not-found'
}

function allowed(item) {
  return (!item.permission || auth.hasPermission(item.permission)) && routeExists(item.path)
}

const branding = useBrandingStore()
const primary = computed(() => branding.primaryNav.filter(allowed))
const groups = computed(() =>
  portalMenuGroups.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((g) => g.items.length),
)

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

// "···" is active when the current page lives only inside it, so the bar
// always shows where the person is.
const moreActive = computed(
  () => !primary.value.some((i) => isActive(i.path)) && groups.value.some((g) => g.items.some((i) => isActive(i.path))),
)

const moreOpen = ref(false)
const moreRef = ref(null)
onClickOutside(moreRef, () => (moreOpen.value = false))

const notificationsOpen = ref(false)
const birthdaysOpen = ref(false)
const chatOpen = ref(false)
const profileOpen = ref(false)

const canEnterAdmin = computed(() => auth.isSuperAdmin)
</script>

<template>
  <header class="flex h-16 shrink-0 items-center bg-primary text-primary-foreground">
    <!-- Wordmark: flush to the edge, the way a logo sits on the reference -->
    <router-link
      to="/"
      class="flex h-16 shrink-0 items-center pl-3 pr-6 text-[34px] font-black uppercase leading-none tracking-tighter text-white transition-opacity hover:opacity-90"
    >
      <img v-if="branding.logoUrl" :src="branding.logoUrl" :alt="branding.appName || t('portal.brand')" class="h-9 max-w-[180px] object-contain" />
      <template v-else>{{ branding.appName || t('portal.brand') }}</template>
    </router-link>

    <!-- Main navigation: centred, active link underlined on the bar's bottom edge -->
    <nav ref="moreRef" class="relative hidden h-16 flex-1 items-center justify-center gap-1 lg:flex" :aria-label="t('a11y.mainNav')">
      <router-link
        v-for="item in primary"
        :key="item.name"
        :to="item.path"
        class="relative flex h-16 items-center px-3.5 text-[14px] transition-default"
        :class="isActive(item.path) ? 'font-semibold text-white' : 'text-white/80 hover:text-white'"
      >
        {{ t(item.labelKey) }}
        <span
          class="absolute inset-x-3.5 bottom-0 h-0.5 rounded-t-full bg-white transition-default"
          :class="isActive(item.path) ? 'opacity-100' : 'opacity-0'"
        />
      </router-link>

      <div class="relative flex h-16 items-center">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-full transition-default"
          :class="moreOpen || moreActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'"
          :aria-label="t('portal.nav.more')"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
          @keydown.escape="moreOpen = false"
        >
          <Icon name="more-horizontal" size="18" />
        </button>
        <span
          class="absolute inset-x-1 bottom-0 h-0.5 rounded-t-full bg-white"
          :class="moreActive ? 'opacity-100' : 'opacity-0'"
        />
      </div>

      <!-- Anchored to the nav, not the button: an 880px panel centred on a
           button near the bar's right third would run off the viewport. -->
      <Transition
          enter-active-class="transition-default"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition-default"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="moreOpen"
            class="absolute left-1/2 top-full z-50 mt-2 w-[880px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl bg-surface p-10 text-left text-ink shadow-xl"
            @keydown.escape="moreOpen = false"
          >
            <div class="grid grid-cols-3 gap-10">
              <div v-for="group in groups" :key="group.labelKey">
                <p class="mb-2 px-3 text-[16px] font-semibold text-ink">{{ t(group.labelKey) }}</p>
                <ul>
                  <li v-for="item in group.items" :key="item.name">
                    <router-link
                      :to="item.path"
                      class="block rounded-lg px-3 py-2.5 text-[14px] transition-default hover:bg-surface-2"
                      :class="isActive(item.path) ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'"
                      @click="moreOpen = false"
                    >
                      {{ t(item.labelKey) }}
                    </router-link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Transition>
    </nav>

    <!-- Right cluster: five 32px circles, 12px apart -->
    <div class="ml-auto flex items-center gap-3 pr-4">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="t('portal.topbar.birthdays')"
        @click="birthdaysOpen = true"
      >
        <Icon name="gift" size="17" />
      </button>

      <button
        type="button"
        class="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="t('portal.topbar.messages')"
        @click="chatOpen = true"
      >
        <Icon name="message-square" size="17" />
        <span
          v-if="chat.unreadTotal > 0"
          class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-primary bg-white px-1 text-[10px] font-bold text-primary"
        >
          {{ chat.unreadTotal > 99 ? '99+' : chat.unreadTotal }}
        </span>
      </button>

      <button
        type="button"
        class="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="t('portal.topbar.notifications')"
        @click="notificationsOpen = true"
      >
        <Icon name="bell" size="17" />
        <span
          v-if="unreadCount > 0"
          class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-primary bg-white px-1 text-[10px] font-bold text-primary"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </button>

      <router-link
        v-if="canEnterAdmin"
        :to="{ name: 'admin-dashboard' }"
        class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
        :aria-label="t('portal.profile.adminPortal')"
      >
        <Icon name="grid" size="17" />
      </router-link>

      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-transparent transition-default hover:border-white/60"
        :aria-label="t('portal.topbar.profile')"
        @click="profileOpen = true"
      >
        <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar ?? ''" size="sm" class="h-8 w-8" />
      </button>
    </div>

    <NotificationsDrawer
      v-model="notificationsOpen"
      :items="notificationItems"
      :unread-count="unreadCount"
      :mark-read="markRead"
      :mark-all-read="markAllRead"
    />
    <BirthdaysDrawer v-model="birthdaysOpen" />
    <ChatDrawer v-model="chatOpen" />
    <ProfileDrawer v-model="profileOpen" />
  </header>
</template>
