<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
    <p class="text-5xl font-bold tracking-tight">401</p>
    <p class="text-slate-500 dark:text-slate-400">{{ t('unauthorized.message') }}</p>
    <router-link to="/login" class="mt-4 text-sm underline">{{ t('auth.login.title') }}</router-link>
  </div>
</template>
