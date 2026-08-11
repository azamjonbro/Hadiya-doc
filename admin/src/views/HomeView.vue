<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { setLocale } from '@/i18n'
import { useHealthCheck } from '@/composables/useHealthCheck'
import NotificationBell from '@/components/NotificationBell.vue'

const { t } = useI18n()
const theme = useThemeStore()
const auth = useAuthStore()
const router = useRouter()
const { status, check } = useHealthCheck()

onMounted(check)

function onLocaleChange(event) {
  setLocale(event.target.value)
}

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-16">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('app.name') }}</h1>
      <div class="flex items-center gap-3">
        <router-link
          v-if="auth.hasPermission('course:read')"
          to="/admin/courses"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('courses.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('news:read')"
          to="/admin/news"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('news.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('task:create')"
          to="/admin/tasks"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('tasks.title') }}
        </router-link>
        <router-link
          v-if="auth.hasPermission('user:read')"
          to="/admin/users"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
        >
          {{ t('users.title') }}
        </router-link>
        <NotificationBell />
        <select
          class="rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          @change="onLocaleChange"
        >
          <option value="uz">UZ</option>
          <option value="ru">RU</option>
          <option value="en">EN</option>
        </select>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
          @click="theme.toggle()"
        >
          {{ theme.theme === 'dark' ? t('theme.light') : t('theme.dark') }}
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
          @click="onLogout"
        >
          {{ t('auth.logout') }}
        </button>
      </div>
    </div>

    <p class="mt-2 text-slate-500 dark:text-slate-400">
      {{ t('nav.dashboard') }} — {{ auth.user?.fullName }} ({{ auth.user?.role }})
    </p>

    <div class="mt-10 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
      <p class="flex items-center text-sm font-medium">
        <span
          class="mr-2 inline-block h-2 w-2 rounded-full"
          :class="{
            'bg-amber-500': status === 'checking',
            'bg-emerald-500': status === 'online',
            'bg-red-500': status === 'offline',
          }"
        />
        {{
          status === 'checking'
            ? t('backend.checking')
            : status === 'online'
              ? t('backend.online')
              : t('backend.offline')
        }}
      </p>
    </div>
  </div>
</template>
