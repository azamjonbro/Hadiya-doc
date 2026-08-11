<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'
import { setLocale, type SupportedLocale } from '@/i18n'
import { useHealthCheck } from '@/composables/useHealthCheck'

const { t } = useI18n()
const theme = useThemeStore()
const { status, check } = useHealthCheck()

onMounted(check)

function onLocaleChange(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as SupportedLocale)
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-16">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('app.name') }}</h1>
      <div class="flex items-center gap-3">
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
      </div>
    </div>

    <p class="mt-2 text-slate-500 dark:text-slate-400">{{ t('nav.dashboard') }}</p>

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
