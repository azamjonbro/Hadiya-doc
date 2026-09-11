<script setup>
import { ref, computed } from 'vue'
import { onClickOutside } from '@/composables/onClickOutside'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { workspaceNav } from './nav'
import { useNotifications } from '@/composables/useNotifications'
import { useChatStore } from '@/stores/chat'
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

const chat = useChatStore()
const { items: notificationItems, unreadCount, markRead, markAllRead } = useNotifications()

const notifOpen = ref(false)
const notifRef = ref(null)
onClickOutside(notifRef, () => (notifOpen.value = false))

const typeMeta = {
  TASK_ASSIGNED: { icon: 'check-square' },
  TASK_DEADLINE_APPROACHING: { icon: 'clock' },
  TASK_OVERDUE: { icon: 'alert-triangle' },
  COURSE_ASSIGNED: { icon: 'graduation-cap' },
  COURSE_DEADLINE_APPROACHING: { icon: 'clock' },
  COURSE_EXPIRED: { icon: 'alert-circle' },
  NEWS_PUBLISHED: { icon: 'newspaper' },
}

const severityStyle = {
  INFO: 'bg-info-subtle text-info',
  WARNING: 'bg-warning-subtle text-warning',
  CRITICAL: 'bg-danger-subtle text-danger',
}

function iconFor(n) {
  return typeMeta[n.type]?.icon ?? 'bell'
}

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return t('notifications.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const navigation = computed(() => workspaceNav.filter((i) => !i.permission || auth.hasPermission(i.permission)))

function isActive(path) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}
</script>

<template>
  <header class="flex h-16 shrink-0 items-center justify-between gap-4 bg-primary px-6 w-full text-primary-foreground shadow-sm">
    <div class="flex items-center gap-6 lg:w-1/4">
      <router-link to="/" class="text-[32px] font-black tracking-tighter uppercase text-white hover:opacity-90 transition-opacity">
        ISHONCH
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

      <!-- Chat -->
      <router-link
        to="/chat"
        class="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
      >
        <Icon name="message-square" size="18" />
        <span v-if="chat.unreadTotal > 0" class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white border border-primary">
          {{ chat.unreadTotal > 9 ? '9+' : chat.unreadTotal }}
        </span>
      </router-link>

      <!-- Notifications -->
      <div ref="notifRef" class="relative">
        <button
          type="button"
          class="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-default hover:bg-white/30"
          :aria-expanded="notifOpen"
          @click="notifOpen = !notifOpen"
        >
          <Icon name="bell" size="18" />
          <span v-if="unreadCount > 0" class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white border border-primary">
            {{ unreadCount > 9 ? '9+' : unreadCount }}
          </span>
        </button>
        
        <Transition enter-active-class="transition-default" enter-from-class="opacity-0 scale-95" leave-active-class="transition-default" leave-to-class="opacity-0 scale-95">
          <div v-if="notifOpen" class="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg text-ink text-left overflow-hidden flex flex-col max-h-[400px]">
            <div class="px-4 py-3 flex items-center justify-between border-b border-border bg-surface-2">
              <span class="font-bold text-small">{{ t('notifications.title') }}</span>
              <button v-if="unreadCount > 0" class="text-caption font-medium text-primary hover:underline" @click="markAllRead">
                {{ t('notifications.markAllRead') }}
              </button>
            </div>
            
            <div class="flex-1 overflow-y-auto">
              <div v-if="notificationItems.length === 0" class="py-8 text-center text-small text-ink-muted flex flex-col items-center">
                <Icon name="bell" size="24" class="mb-2 opacity-50" />
                {{ t('notifications.empty') }}
              </div>
              
              <div
                v-for="item in notificationItems.slice(0, 5)"
                :key="item.id"
                class="flex cursor-pointer items-start gap-3 p-3 transition-default hover:bg-surface-2 border-b border-border/40 last:border-0"
                @click="markRead(item)"
              >
                <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" :class="severityStyle[item.severity]">
                  <Icon :name="iconFor(item)" size="14" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-small text-ink leading-tight" :class="!item.read ? 'font-medium' : ''">{{ item.title }}</p>
                  <p class="mt-1 text-caption text-ink-faint">{{ timeAgo(item.createdAt) }}</p>
                </div>
                <span v-if="!item.read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              </div>
            </div>
            
            <router-link to="/notifications" class="block w-full border-t border-border bg-surface-2 py-2 text-center text-small font-medium text-primary hover:bg-surface-hover transition-default" @click="notifOpen = false">
              {{ t('common.viewAll') }}
            </router-link>
          </div>
        </Transition>
      </div>

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
