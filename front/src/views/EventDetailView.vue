<script setup>
/**
 * One event, from the point of view of somebody deciding whether to go.
 *
 * The two things that need saying clearly are whether there is a seat left
 * and, if the person is queued, where they are in the queue — "you are
 * third" is a decision they can act on, "you are on the waiting list" is
 * not.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { eventsApi } from '@/services/events'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorText } from '@/utils/apiError'
import AppCard from '@/components/ui/AppCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const event = ref(null)
const loading = ref(true)
const working = ref(false)

const registration = computed(() => event.value?.myRegistration ?? null)
const isSeated = computed(() => ['REGISTERED', 'ATTENDED'].includes(registration.value?.status))
const isQueued = computed(() => registration.value?.status === 'WAITLIST')
const isPast = computed(() => event.value && new Date(event.value.endAt) < new Date())
const isCancelled = computed(() => event.value?.status === 'CANCELLED')

const full = computed(
  () => Boolean(event.value?.capacity) && event.value.registeredCount >= event.value.capacity
)

function formatWhen(value) {
  return new Date(value).toLocaleString(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function load() {
  loading.value = true
  try {
    event.value = await eventsApi.getById(route.params.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('events.loadError')))
  } finally {
    loading.value = false
  }
}

async function register() {
  working.value = true
  try {
    const result = await eventsApi.register(route.params.id)
    // The server, not the button, decides whether this was a seat or a
    // place in the queue — the room may have filled since the page loaded.
    toast.success(
      result.status === 'REGISTERED'
        ? t('events.registered')
        : t('events.waitlisted', { position: result.waitlistPosition })
    )
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('events.registerError')))
  } finally {
    working.value = false
  }
}

async function cancel() {
  const ok = await confirm({
    title: t('events.cancelTitle'),
    message: isSeated.value ? t('events.cancelSeatMessage') : t('events.cancelQueueMessage'),
  })
  if (!ok) return
  working.value = true
  try {
    await eventsApi.cancelRegistration(route.params.id)
    toast.success(t('events.registrationCancelled'))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error, t('events.registerError')))
  } finally {
    working.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-8">
    <button type="button" class="flex items-center gap-1.5 text-small text-ink-muted hover:text-ink" @click="router.push('/events')">
      <Icon name="chevron-left" size="16" />
      {{ t('events.title') }}
    </button>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton class="h-10 w-64" />
      <Skeleton class="h-40 w-full rounded-xl" />
    </div>

    <template v-else-if="event">
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="neutral" size="sm">{{ t('eventTypes.' + event.type) }}</Badge>
        <Badge v-if="isCancelled" variant="danger" size="sm">{{ t('events.cancelled') }}</Badge>
        <Badge v-else-if="isPast" variant="neutral" size="sm">{{ t('events.past') }}</Badge>
        <Badge v-if="event.mode !== 'OFFLINE'" variant="info" size="sm">{{ t(`events.mode.${event.mode}`) }}</Badge>
      </div>
      <h1 class="mt-2 text-h1 text-ink">{{ event.title }}</h1>
      <p v-if="event.description" class="mt-2 text-small text-ink-muted">{{ event.description }}</p>

      <AppCard class="mt-6 space-y-3 p-5 border border-border shadow-sm">
        <div class="flex items-center gap-2 text-small text-ink">
          <Icon name="clock" size="15" class="shrink-0 text-ink-faint" />
          {{ formatWhen(event.startAt) }} — {{ new Date(event.endAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) }}
        </div>
        <div v-if="event.location" class="flex items-center gap-2 text-small text-ink">
          <Icon name="map-pin" size="15" class="shrink-0 text-ink-faint" />
          {{ event.location }}
        </div>
        <div v-if="event.capacity" class="flex items-center gap-2 text-small text-ink">
          <Icon name="users" size="15" class="shrink-0 text-ink-faint" />
          {{ t('events.seats', { taken: event.registeredCount, total: event.capacity }) }}
          <Badge v-if="full" variant="warning" size="sm">{{ t('events.full') }}</Badge>
        </div>

        <!-- Joining details, only present when the server decided this
             person may have them (a seat, or organising it). -->
        <div v-if="event.meeting?.url && isSeated" class="border-t border-border pt-3">
          <a
            :href="event.meeting.url"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-2 text-small font-medium text-primary hover:underline"
          >
            <Icon name="video" size="15" />
            {{ t('events.joinOnline') }}
          </a>
          <p v-if="event.meeting.passcode" class="mt-1.5 text-caption text-ink-muted">
            {{ t('events.passcode') }}: <span class="font-mono text-ink">{{ event.meeting.passcode }}</span>
          </p>
        </div>
      </AppCard>

      <AppCard v-if="event.requiresRegistration && !isCancelled && !isPast" class="mt-4 p-5 border border-border shadow-sm">
        <template v-if="isQueued">
          <p class="text-small font-medium text-ink">{{ t('events.youAreQueued', { position: registration.waitlistPosition }) }}</p>
          <p class="mt-1 text-caption text-ink-muted">{{ t('events.queueHint') }}</p>
          <AppButton class="mt-3" variant="secondary" :loading="working" @click="cancel">
            {{ t('events.leaveQueue') }}
          </AppButton>
        </template>
        <template v-else-if="isSeated">
          <p class="flex items-center gap-1.5 text-small font-medium text-success">
            <Icon name="check-circle" size="15" />
            {{ t('events.youHaveASeat') }}
          </p>
          <AppButton class="mt-3" variant="secondary" :loading="working" @click="cancel">
            {{ t('events.giveUpSeat') }}
          </AppButton>
        </template>
        <template v-else>
          <p class="text-small text-ink-muted">
            {{ full ? t('events.fullHint') : t('events.registerHint') }}
          </p>
          <AppButton class="mt-3" :loading="working" @click="register">
            {{ full ? t('events.joinQueue') : t('events.register') }}
          </AppButton>
        </template>
      </AppCard>

      <p v-else-if="isCancelled" class="mt-4 flex items-center gap-1.5 text-small text-danger">
        <Icon name="alert-circle" size="15" />
        {{ event.cancelReason || t('events.cancelledHint') }}
      </p>
    </template>
  </div>
</template>
