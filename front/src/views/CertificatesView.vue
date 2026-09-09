<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { certificatesApi } from '@/services/certificates'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t, locale } = useI18n()
const toast = useToast()

const items = ref([])
const loading = ref(true)
const downloading = ref('')

const statusVariant = { VALID: 'success', EXPIRED: 'warning', REVOKED: 'danger' }

const sorted = computed(() =>
  // Valid ones first: this page is usually opened to fetch a certificate,
  // not to look at the ones that no longer count.
  [...items.value].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'VALID' ? -1 : b.status === 'VALID' ? 1 : 0
    return new Date(b.issuedAt) - new Date(a.issuedAt)
  })
)

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
}

async function load() {
  loading.value = true
  try {
    items.value = await certificatesApi.mine()
  } catch (error) {
    toast.error(apiErrorText(error, t('certificates.loadError')))
  } finally {
    loading.value = false
  }
}

async function download(certificate) {
  downloading.value = certificate.id
  try {
    await certificatesApi.download(certificate.id)
  } catch (error) {
    toast.error(apiErrorText(error, t('certificates.downloadError')))
  } finally {
    downloading.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-8">
    <h1 class="text-h1 text-ink">{{ t('certificates.title') }}</h1>
    <p class="mt-1 text-small text-ink-muted">{{ t('certificates.subtitle') }}</p>

    <div v-if="loading" class="mt-6 space-y-3">
      <Skeleton v-for="n in 3" :key="n" class="h-28 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="!sorted.length"
      class="mt-6"
      icon="award"
      :title="t('certificates.emptyTitle')"
      :description="t('certificates.emptyDescription')"
    />

    <div v-else class="mt-6 space-y-3">
      <AppCard v-for="certificate in sorted" :key="certificate.id" class="p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-h3 text-ink">{{ certificate.title }}</h2>
              <Badge :variant="statusVariant[certificate.status]" size="sm">
                {{ t(`certificates.status.${certificate.status}`) }}
              </Badge>
            </div>
            <dl class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-small text-ink-muted">
              <div class="flex gap-1.5">
                <dt>{{ t('certificates.issuedAt') }}:</dt>
                <dd class="text-ink">{{ formatDate(certificate.issuedAt) }}</dd>
              </div>
              <div v-if="certificate.validUntil" class="flex gap-1.5">
                <dt>{{ t('certificates.validUntil') }}:</dt>
                <dd class="text-ink">{{ formatDate(certificate.validUntil) }}</dd>
              </div>
              <div class="flex gap-1.5">
                <dt>{{ t('certificates.serial') }}:</dt>
                <dd class="font-mono text-ink">{{ certificate.serial }}</dd>
              </div>
            </dl>
            <p v-if="certificate.status === 'REVOKED'" class="mt-2 flex items-center gap-1.5 text-small text-danger">
              <Icon name="alert-circle" size="14" />
              {{ t('certificates.revokedNote', { date: formatDate(certificate.revokedAt) }) }}
            </p>
          </div>

          <AppButton
            v-if="certificate.status !== 'REVOKED'"
            icon="download"
            variant="secondary"
            :loading="downloading === certificate.id"
            @click="download(certificate)"
          >
            {{ t('certificates.download') }}
          </AppButton>
        </div>
      </AppCard>
    </div>
  </div>
</template>
