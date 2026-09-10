<script setup>
/**
 * "Where am I signed in?" (11.6).
 *
 * The sessions were always there — a refresh token is a row — but nothing
 * showed them to the person they belong to, so the only answer to a "new
 * device" notification was changing the password, which ends every session
 * including the one reading the mail.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { securityApi } from '@/services/security'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const auth = useAuthStore()

const sessions = ref([])
const loading = ref(true)
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    sessions.value = await securityApi.sessions()
  } catch (error) {
    toast.error(apiErrorText(error, t('sessions.loadFailed')))
  } finally {
    loading.value = false
  }
}

async function end(session) {
  const message = session.current ? t('sessions.confirmEndCurrent') : t('sessions.confirmEnd', { device: session.device })
  if (!(await confirm.ask({ message }))) return
  busy.value = true
  try {
    const result = await securityApi.revokeSession(session.id)
    // Ending the current session means this app is signed out — the API
    // says which one it was, because a 200 cannot say it.
    if (result.wasCurrent) {
      await auth.logout()
      return
    }
    await load()
    toast.success(t('sessions.ended'))
  } catch (error) {
    toast.error(apiErrorText(error, t('sessions.endFailed')))
  } finally {
    busy.value = false
  }
}

async function endOthers() {
  if (!(await confirm.ask({ message: t('sessions.confirmEndOthers') }))) return
  busy.value = true
  try {
    const { revoked } = await securityApi.revokeOtherSessions()
    await load()
    toast.success(t('sessions.endedOthers', { count: revoked }))
  } catch (error) {
    toast.error(apiErrorText(error, t('sessions.endFailed')))
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppCard class="border border-border p-6 shadow-sm">
    <h2 class="text-[11px] font-bold uppercase tracking-widest text-ink-faint">{{ t('sessions.title') }}</h2>
    <p class="mt-2 text-small text-ink-muted">{{ t('sessions.hint') }}</p>

    <p v-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>
    <p v-else-if="!sessions.length" class="mt-3 text-caption text-ink-faint">{{ t('sessions.empty') }}</p>

    <ul v-else class="mt-3 divide-y divide-border">
      <li v-for="session in sessions" :key="session.id" class="flex flex-wrap items-center gap-2 py-2.5">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-small font-medium text-ink">
            {{ session.device }}
            <Badge v-if="session.current" variant="success" size="sm" class="ml-1">{{ t('sessions.thisDevice') }}</Badge>
          </span>
          <span class="block truncate text-caption text-ink-faint">
            {{ session.ip || '—' }} ·
            {{ t('sessions.lastSeen', { date: new Date(session.lastSeenAt).toLocaleString(locale) }) }}
          </span>
        </span>
        <AppButton variant="ghost" size="sm" icon="lock" :loading="busy" @click="end(session)">
          {{ t('sessions.end') }}
        </AppButton>
      </li>
    </ul>

    <AppButton
      v-if="sessions.length > 1"
      class="mt-3"
      variant="secondary"
      size="sm"
      :loading="busy"
      @click="endOthers"
    >
      {{ t('sessions.endOthers') }}
    </AppButton>
  </AppCard>
</template>
