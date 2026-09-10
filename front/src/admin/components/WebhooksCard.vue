<script setup>
/**
 * Webhook subscriptions (11.2).
 *
 * The screen is built around the two questions this feature actually
 * produces in support: "did it arrive?" and "why did it stop?". Hence the
 * delivery log next to each endpoint with the status the receiver returned,
 * a resend button, and the automatic stop stated in words rather than left
 * as a silent `active: false`.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { webhooksApi } from '@/services/webhooks'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

const hooks = ref([])
const events = ref([])
const loading = ref(true)
const creating = ref(false)

const form = ref({ name: '', url: '', events: [] })
// Held only until the page is left, like an API key: this is the one moment
// the signing secret exists outside whoever asked for it.
const issued = ref(null)

// Which endpoint's log is open, and its rows. One at a time — a log per
// endpoint all expanded at once is a wall of rows nobody reads.
const openLog = ref(null)
const deliveries = ref([])
const logLoading = ref(false)

const canCreate = computed(
  () => form.value.name.trim().length >= 2 && form.value.url.trim().length > 8 && form.value.events.length > 0
)

async function load() {
  loading.value = true
  try {
    const [list, catalogue] = await Promise.all([webhooksApi.list(), webhooksApi.events()])
    hooks.value = list
    events.value = catalogue
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.loadFailed')))
  } finally {
    loading.value = false
  }
}

function toggleEvent(event) {
  const next = new Set(form.value.events)
  next.has(event) ? next.delete(event) : next.add(event)
  form.value.events = [...next]
}

async function create() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    issued.value = await webhooksApi.create({
      name: form.value.name.trim(),
      url: form.value.url.trim(),
      events: form.value.events,
    })
    form.value = { name: '', url: '', events: [] }
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.createFailed')))
  } finally {
    creating.value = false
  }
}

async function copySecret() {
  try {
    await navigator.clipboard.writeText(issued.value.secret)
    toast.success(t('webhooks.copied'))
  } catch {
    // Clipboard access can be refused; the secret is on screen either way.
    toast.error(t('webhooks.copyFailed'))
  }
}

async function toggleActive(hook) {
  try {
    await webhooksApi.update(hook.id, { active: !hook.active })
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.saveFailed')))
  }
}

async function rotate(hook) {
  if (!(await confirm.ask({ message: t('webhooks.confirmRotate', { name: hook.name }) }))) return
  try {
    issued.value = await webhooksApi.rotateSecret(hook.id)
    toast.success(t('webhooks.rotated'))
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.saveFailed')))
  }
}

async function ping(hook) {
  try {
    await webhooksApi.ping(hook.id)
    // Queued, not sent: the answer arrives in the log a moment later, and
    // saying "sent" here would be a claim we cannot back up yet.
    toast.success(t('webhooks.pingQueued'))
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.pingFailed')))
  }
}

async function remove(hook) {
  if (!(await confirm.ask({ message: t('webhooks.confirmDelete', { name: hook.name }) }))) return
  try {
    await webhooksApi.remove(hook.id)
    if (openLog.value === hook.id) openLog.value = null
    await load()
    toast.success(t('webhooks.deleted'))
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.deleteFailed')))
  }
}

async function showLog(hook) {
  if (openLog.value === hook.id) {
    openLog.value = null
    return
  }
  openLog.value = hook.id
  logLoading.value = true
  try {
    deliveries.value = await webhooksApi.deliveries({ webhookId: hook.id, limit: 20 })
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.loadFailed')))
  } finally {
    logLoading.value = false
  }
}

async function replay(delivery) {
  try {
    await webhooksApi.replay(delivery.id)
    toast.success(t('webhooks.replayQueued'))
    const hook = hooks.value.find((row) => row.id === openLog.value)
    if (hook) {
      openLog.value = null
      await showLog(hook)
    }
  } catch (error) {
    toast.error(apiErrorText(error, t('webhooks.replayFailed')))
  }
}

const statusVariant = (status) =>
  status === 'DELIVERED' ? 'success' : status === 'FAILED' ? 'danger' : 'warning'

onMounted(load)
</script>

<template>
  <AppCard>
    <h2 class="text-small font-semibold text-ink">{{ t('webhooks.title') }}</h2>
    <p class="mt-0.5 text-caption text-ink-muted">{{ t('webhooks.hint') }}</p>

    <!-- Shown once, and said so plainly — same as an API key. -->
    <div v-if="issued" class="mt-3 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2.5">
      <p class="flex items-center gap-1.5 text-small font-medium text-warning">
        <Icon name="alert-triangle" size="14" />
        {{ t('webhooks.copyNow') }}
      </p>
      <code class="mt-1.5 block break-all rounded bg-surface px-2 py-1.5 text-caption text-ink">{{ issued.secret }}</code>
      <p class="mt-1.5 text-caption text-ink-muted">{{ t('webhooks.secretUse') }}</p>
      <div class="mt-2 flex gap-2">
        <AppButton size="sm" icon="copy" @click="copySecret">{{ t('webhooks.copy') }}</AppButton>
        <AppButton variant="ghost" size="sm" @click="issued = null">{{ t('webhooks.stored') }}</AppButton>
      </div>
    </div>

    <p v-if="loading" class="mt-3 text-caption text-ink-faint">{{ t('common.loading') }}</p>

    <ul v-else-if="hooks.length" class="mt-3 divide-y divide-border">
      <li v-for="hook in hooks" :key="hook.id" class="py-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-small font-medium text-ink">{{ hook.name }}</span>
            <span class="block truncate text-caption text-ink-faint">{{ hook.url }}</span>
            <span class="block truncate text-caption text-ink-faint">
              {{ hook.events.join(', ') }}
              <template v-if="hook.lastDeliveryAt">
                · {{ t('webhooks.lastDelivery', {
                  date: new Date(hook.lastDeliveryAt).toLocaleString(locale),
                  status: hook.lastStatus ?? '—',
                }) }}
              </template>
              <template v-else> · {{ t('webhooks.neverDelivered') }}</template>
            </span>
            <!-- Why it stopped, in words: an endpoint that switched itself
                 off is otherwise indistinguishable from one somebody
                 turned off on purpose. -->
            <span v-if="hook.disabledReason" class="block text-caption text-danger">
              {{ t('webhooks.autoDisabled', { reason: hook.disabledReason }) }}
            </span>
          </span>
          <Badge :variant="hook.active ? 'success' : 'danger'" size="sm">
            {{ hook.active ? t('webhooks.activeLabel') : t('webhooks.inactiveLabel') }}
          </Badge>
          <AppButton variant="ghost" size="sm" icon="list" @click="showLog(hook)">{{ t('webhooks.log') }}</AppButton>
          <AppButton variant="ghost" size="sm" icon="send" @click="ping(hook)">{{ t('webhooks.ping') }}</AppButton>
          <AppButton variant="ghost" size="sm" icon="refresh-cw" @click="rotate(hook)">
            {{ t('webhooks.rotate') }}
          </AppButton>
          <AppButton variant="ghost" size="sm" :icon="hook.active ? 'pause' : 'play'" @click="toggleActive(hook)">
            {{ hook.active ? t('webhooks.pause') : t('webhooks.resume') }}
          </AppButton>
          <AppButton variant="ghost" size="sm" icon="trash-2" @click="remove(hook)">{{ t('common.delete') }}</AppButton>
        </div>

        <div v-if="openLog === hook.id" class="mt-2 rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <p v-if="logLoading" class="text-caption text-ink-faint">{{ t('common.loading') }}</p>
          <p v-else-if="!deliveries.length" class="text-caption text-ink-faint">{{ t('webhooks.noDeliveries') }}</p>
          <ul v-else class="divide-y divide-border">
            <li v-for="row in deliveries" :key="row.id" class="flex flex-wrap items-center gap-2 py-1.5">
              <Badge :variant="statusVariant(row.status)" size="sm">{{ row.status }}</Badge>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-caption text-ink">
                  {{ row.event }} · {{ new Date(row.occurredAt).toLocaleString(locale) }}
                  <template v-if="row.responseStatus"> · HTTP {{ row.responseStatus }}</template>
                  · {{ t('webhooks.attempts', { count: row.attempts }) }}
                </span>
                <!-- The receiver's own error is almost always the reason. -->
                <span v-if="row.error" class="block truncate text-caption text-danger">{{ row.error }}</span>
                <span v-if="row.replayOf" class="block text-caption text-ink-faint">{{ t('webhooks.isReplay') }}</span>
              </span>
              <AppButton
                v-if="row.status !== 'DELIVERED'"
                variant="ghost"
                size="sm"
                icon="rotate-ccw"
                @click="replay(row)"
              >
                {{ t('webhooks.replay') }}
              </AppButton>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <p v-else class="mt-3 text-caption text-ink-faint">{{ t('webhooks.empty') }}</p>

    <div class="mt-4 space-y-2 border-t border-border pt-3">
      <p class="text-caption font-medium text-ink-muted">{{ t('webhooks.newTitle') }}</p>
      <div class="flex flex-wrap gap-2">
        <AppInput v-model="form.name" class="min-w-0 flex-1" :placeholder="t('webhooks.namePlaceholder')" />
        <AppInput v-model="form.url" class="min-w-0 flex-1" placeholder="https://…" />
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="event in events"
          :key="event"
          type="button"
          class="rounded-full border px-2.5 py-1 text-caption transition-default"
          :class="form.events.includes(event) ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-ink-muted hover:border-border-strong'"
          @click="toggleEvent(event)"
        >
          {{ event }}
        </button>
      </div>

      <AppButton size="sm" :disabled="!canCreate" :loading="creating" icon="plus" @click="create">
        {{ t('webhooks.create') }}
      </AppButton>
      <p class="text-caption text-ink-faint">{{ t('webhooks.retryNote') }}</p>
    </div>
  </AppCard>
</template>
