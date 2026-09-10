<script setup>
import { ref, computed } from 'vue'
import { onClickOutside } from '@/composables/onClickOutside'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { workspaceNav } from './nav'
import { useNotifications } from '@/composables/useNotifications'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const profileOpen = ref(false)
const profileRef = ref(null)
onClickOutside(profileRef, () => (profileOpen.value = false))

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

const { unreadCount } = useNotifications()

const navigation = computed(() => workspaceNav.filter((i) => !i.permission || auth.hasPermission(i.permission)))

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between gap-4 bg-primary px-6 w-full text-primary-foreground shadow-sm">
    <div class="flex items-center gap-6 lg:w-1/4">
      <router-link to="/" class="text-[28px] font-black tracking-tighter uppercase text-white hover:opacity-90 transition-opacity">
        HADIYA
      </router-link>
    </div>

    <!-- Main Navigation -->
    <nav class="hidden flex-1 justify-center gap-6 lg:flex">
      <router-link
        v-for="item in navigation.slice(0, 5)"
        :key="item.name"
        :to="item.path"
        class="text-small font-medium text-white/80 transition-default hover:text-white"
        :class="{ 'text-white font-bold border-b-2 border-white pb-1': isActive(item.path) }"
      >
        {{ t(item.labelKey) }}
      </router-link>
      <!-- "..." dropdown for the rest of items -->
      <div v-if="navigation.length > 5" class="relative group flex items-center">
        <button class="text-white/80 hover:text-white transition-default font-bold tracking-widest pb-1">...</button>
        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-0 hidden w-48 flex-col rounded-md bg-surface border border-border shadow-md py-1 group-hover:flex z-50">
          <router-link
            v-for="item in navigation.slice(5)"
            :key="item.name"
            :to="item.path"
            class="px-4 py-2 text-small text-ink hover:bg-surface-2 transition-default"
            :class="{ 'font-semibold text-primary': isActive(item.path) }"
          >
            {{ t(item.labelKey) }}
          </router-link>
        </div>
      </div>
    </nav>

    <!-- Right Side Icons -->
    <div class="flex items-center gap-3 lg:w-1/4 justify-end">
      
      <!-- Gift -->
      <button class="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30">
        <Icon name="gift" size="18" />
      </button>

      <!-- Search -->
      <button class="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30">
        <Icon name="search" size="18" />
      </button>

      <!-- Notifications -->
      <router-link
        to="/notifications"
        class="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
      >
        <Icon name="bell" size="18" />
        <span v-if="unreadCount > 0" class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white border border-primary">
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </router-link>

      <!-- Apps grid -->
      <button class="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30">
        <Icon name="grid" size="18" />
      </button>

      <!-- Profile -->
      <div ref="profileRef" class="relative ml-1">
        <button
          type="button"
          class="flex items-center justify-center rounded-full border-2 border-transparent transition-default hover:border-white/50"
          :aria-expanded="profileOpen"
          @click="profileOpen = !profileOpen"
        >
          <Avatar :name="auth.user?.fullName ?? ''" size="sm" class="rounded-full h-9 w-9" />
        </button>
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 scale-95" leave-active-class="transition-default" leave-to-class="opacity-0 scale-95">
          <div v-if="profileOpen" class="absolute right-0 z-50 mt-2 w-56 rounded border border-border bg-surface p-1 shadow-sm text-ink text-left">
            <div class="px-3 py-2.5">
              <p class="truncate text-small font-semibold">{{ auth.user?.fullName }}</p>
              <p class="truncate text-caption text-ink-muted mt-0.5">{{ auth.user?.email }}</p>
            </div>
            <div class="my-1 border-t border-border" />
            <router-link
              v-if="auth.isSuperAdmin"
              :to="{ name: 'admin-dashboard' }"
              class="flex items-center gap-2 rounded px-3 py-2 text-small transition-default hover:bg-surface-2"
              @click="profileOpen = false"
            >
              <Icon name="shield" size="15" />
              {{ t('settings.adminPanel.open') }}
            </router-link>
            <router-link to="/settings" class="flex items-center gap-2 rounded px-3 py-2 text-small transition-default hover:bg-surface-2" @click="profileOpen = false">
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
