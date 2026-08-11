<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const identifier = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')

async function onSubmit() {
  submitting.value = true
  errorMessage.value = ''
  try {
    await auth.login(identifier.value, password.value)
    if (!auth.canUseAdminApp) {
      errorMessage.value = t('forbidden.message')
      await auth.logout()
      return
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? t('auth.login.error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center px-6 py-16">
    <form
      class="w-full max-w-sm rounded-xl border border-slate-200 p-8 dark:border-slate-800"
      @submit.prevent="onSubmit"
    >
      <h1 class="text-xl font-semibold tracking-tight">{{ t('auth.login.title') }}</h1>

      <label class="mt-6 block text-sm font-medium">
        {{ t('auth.login.identifier') }}
        <input
          v-model="identifier"
          type="text"
          autocomplete="username"
          required
          class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        />
      </label>

      <label class="mt-4 block text-sm font-medium">
        {{ t('auth.login.password') }}
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        />
      </label>

      <p v-if="errorMessage" class="mt-4 text-sm text-red-500">{{ errorMessage }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="mt-6 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
      >
        {{ submitting ? t('auth.login.submitting') : t('auth.login.submit') }}
      </button>
    </form>
  </div>
</template>
