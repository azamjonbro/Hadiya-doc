<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { roleLabel } from '@/utils/roleLabel'
import { useAuthStore } from '@/stores/auth'
import { gamificationApi } from '@/services/gamification'
import { certificatesApi } from '@/services/certificates'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import Avatar from '@/components/ui/Avatar.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Badge from '@/components/ui/Badge.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PillTabs from '@/components/portal/PillTabs.vue'
import SettingsPanel from '@/components/profile/SettingsPanel.vue'

/**
 * The profile page (reference §10): a cover, the avatar half over it,
 * three figures, and six tabs. Rating, certificates and settings used to
 * be pages of their own; they live here now and the old paths redirect.
 * The tab is in the URL (`?tab=`) so the profile drawer can open one
 * directly and the back button returns to the previous tab.
 */
const TABS = ['summary', 'rating', 'points', 'badges', 'certificates', 'settings']

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const activeTab = ref(TABS.includes(route.query.tab) ? route.query.tab : 'summary')
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) router.replace({ query: { ...route.query, tab } })
})
watch(
  () => route.query.tab,
  (tab) => {
    if (TABS.includes(tab) && tab !== activeTab.value) activeTab.value = tab
  }
)

const summary = ref(null)
const board = ref([])
const pointsHistory = ref(null)
const badgeCatalog = ref(null)
const certificates = ref(null)
const loading = ref(true)

const tabs = computed(() => [
  { value: 'summary', label: t('portal.profile.tabs.summary') },
  { value: 'rating', label: t('portal.profile.tabs.rating') },
  { value: 'points', label: t('portal.profile.tabs.points') },
  { value: 'badges', label: t('portal.profile.tabs.badges') },
  { value: 'certificates', label: t('portal.profile.tabs.certificates') },
  { value: 'settings', label: t('portal.profile.tabs.settings') },
])

const myId = computed(() => auth.user?.id)
const earnedBadges = computed(() => (badgeCatalog.value ?? []).filter((badge) => badge.earnedAt))

// The two rows the summary shows: the person just above, and the person
// themselves — enough to see what closing the gap takes.
const neighbours = computed(() => {
  const index = board.value.findIndex((row) => row.userId === myId.value)
  if (index === -1) return board.value.slice(0, 2)
  return board.value.slice(Math.max(0, index - 1), index + 1)
})

// The seeded badges carry their code as a name; the catalog's own name
// wins once an admin has written one.
function badgeName(badge) {
  if (badge.name && badge.name !== badge.code) return badge.name
  const key = `gamification.badges.${badge.code}.title`
  return te(key) ? t(key) : badge.name
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
}

const MEDAL = { 1: 'bg-amber-400 text-white', 2: 'bg-slate-300 text-white', 3: 'bg-orange-400 text-white' }

const statusVariant = { VALID: 'success', EXPIRED: 'warning', REVOKED: 'danger' }
const downloading = ref('')
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

// The three figures and the summary tab come from one round of requests;
// the other tabs fetch on first open, and only once.
async function load() {
  loading.value = true
  const [s, b, c, cat] = await Promise.allSettled([
    gamificationApi.getMySummary(),
    gamificationApi.leaderboard({ limit: 50 }),
    certificatesApi.mine(),
    gamificationApi.getBadgeCatalog(),
  ])
  summary.value = s.status === 'fulfilled' ? s.value : { totalPoints: 0, rank: null, badges: [] }
  board.value = b.status === 'fulfilled' ? b.value.rows : []
  certificates.value = c.status === 'fulfilled' ? c.value : []
  badgeCatalog.value = cat.status === 'fulfilled' ? cat.value.items : []
  loading.value = false
}

async function loadPoints() {
  if (pointsHistory.value) return
  try {
    pointsHistory.value = (await gamificationApi.getMyPoints()).items
  } catch {
    pointsHistory.value = []
  }
}

watch(activeTab, (tab) => tab === 'points' && loadPoints(), { immediate: true })
onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-surface pb-16">
    <!-- Rasm 27: the cover is 1400 wide and 160 tall, the content 1200 —
         wider than the notes' 1024/120, and the screenshot is the truth. -->
    <div class="mx-auto w-full max-w-[1400px]">
      <!-- Cover: a photo shipped with the app (/hero/profile.jpg); the
           gradient stays under it for a deployment without the file -->
      <div
        class="h-[160px] w-full bg-cover bg-center bg-gradient-to-r from-primary via-emerald-700 to-slate-700"
        style="background-image: url('/hero/profile.jpg')"
      ></div>

      <div class="px-4 sm:px-[100px]">
        <!-- Avatar over the cover edge, name beside it, figures on the right -->
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div class="flex items-end gap-4">
            <div class="-mt-[60px] rounded-full bg-surface p-1">
              <Avatar :name="auth.user?.fullName ?? ''" :src="auth.user?.avatar" size="2xl" />
            </div>
            <div class="pb-1">
              <h1 class="text-[24px] font-semibold leading-tight text-ink">{{ auth.user?.fullName }}</h1>
              <p class="text-[13px] text-ink-muted">{{ auth.user?.position || auth.user?.department || roleLabel(auth.user?.role, { t, te }) }}</p>
            </div>
          </div>
          <dl class="flex items-start gap-12 pb-1">
            <div class="w-[100px]">
              <dd class="text-[28px] font-medium leading-none text-ink">{{ summary?.totalPoints ?? 0 }}</dd>
              <dt class="mt-2 text-[12px] leading-snug text-ink-muted">{{ t('portal.profile.points') }}</dt>
            </div>
            <div class="w-[100px]">
              <dd class="text-[28px] font-medium leading-none text-ink">{{ earnedBadges.length }}</dd>
              <dt class="mt-2 text-[12px] leading-snug text-ink-muted">{{ t('portal.profile.badges') }}</dt>
            </div>
            <div class="w-[100px]">
              <dd class="text-[28px] font-medium leading-none text-ink">{{ certificates?.length ?? 0 }}</dd>
              <dt class="mt-2 text-[12px] leading-snug text-ink-muted">{{ t('portal.profile.certificates') }}</dt>
            </div>
          </dl>
        </div>

        <div class="mt-8 border-b border-border">
          <PillTabs v-model="activeTab" :tabs="tabs" class="pb-2" />
        </div>

        <div class="mt-6">
          <template v-if="loading">
            <Skeleton class="h-8 w-48" />
            <Skeleton class="mt-4 h-40 w-full rounded-lg" />
          </template>

          <!-- ===== Summary ===== -->
          <template v-else-if="activeTab === 'summary'">
            <section>
              <div class="flex items-center justify-between border-b border-border pb-3">
                <h2 class="text-[18px] font-semibold text-ink">{{ t('portal.profile.rankTitle') }}</h2>
                <button type="button" class="text-[13px] text-ink-muted hover:text-ink" @click="activeTab = 'rating'">
                  {{ t('portal.profile.fullRating') }} →
                </button>
              </div>
              <ul v-if="neighbours.length" class="divide-y divide-border">
                <li
                  v-for="row in neighbours"
                  :key="row.userId"
                  class="flex h-16 items-center gap-3 px-6"
                  :class="row.userId === myId ? 'bg-primary/5' : ''"
                >
                  <span
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                    :class="MEDAL[row.rank] ?? 'text-ink-muted'"
                  >{{ MEDAL[row.rank] ? row.rank : `${row.rank}.` }}</span>
                  <Avatar :name="row.fullName" :src="row.avatar" size="xs" />
                  <span class="min-w-0 flex-1 truncate text-[14px] text-ink">{{ row.fullName }}</span>
                  <span class="flex w-24 items-center gap-2 text-[14px] text-ink"><Icon name="star" size="16" class="text-primary" />{{ row.totalPoints }}</span>
                  <span class="flex w-24 items-center gap-2 text-[14px] text-ink"><Icon name="award" size="16" class="text-primary" />{{ row.badgeCount ?? 0 }}</span>
                </li>
              </ul>
              <p v-else class="py-10 text-center text-[14px] text-ink-muted">{{ t('gamification.empty') }}</p>
            </section>

            <section class="mt-10">
              <h2 class="border-b border-border pb-3 text-[18px] font-semibold text-ink">{{ t('portal.profile.myBadges') }}</h2>
              <div v-if="earnedBadges.length" class="mt-3 flex flex-wrap gap-3">
                <div v-for="badge in earnedBadges" :key="badge.code" class="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon :name="badge.icon" size="16" /></span>
                  <span class="text-[13px] font-medium text-ink">{{ badgeName(badge) }}</span>
                </div>
              </div>
              <p v-else class="py-10 text-center text-[14px] text-ink-muted">{{ t('gamification.noBadgesYet') }}</p>
            </section>

            <section class="mt-10">
              <div class="flex items-center justify-between border-b border-border pb-3">
                <h2 class="text-[18px] font-semibold text-ink">{{ t('portal.profile.myCertificates') }}</h2>
                <button v-if="certificates?.length > 2" type="button" class="text-[13px] text-ink-muted hover:text-ink" @click="activeTab = 'certificates'">
                  {{ t('portal.profile.seeAll') }} →
                </button>
              </div>
              <div v-if="certificates?.length" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div v-for="certificate in certificates.slice(0, 2)" :key="certificate.id" class="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span class="flex h-[66px] w-[96px] shrink-0 items-center justify-center rounded border border-border bg-surface-2 text-primary"><Icon name="award" size="28" /></span>
                  <div class="min-w-0">
                    <p class="truncate text-[15px] font-medium text-ink">{{ t('portal.profile.forCourse', { title: certificate.title }) }}</p>
                    <p class="text-[12px] text-ink-muted">{{ formatDate(certificate.issuedAt) }}</p>
                  </div>
                </div>
              </div>
              <p v-else class="py-10 text-center text-[14px] text-ink-muted">{{ t('certificates.emptyTitle') }}</p>
            </section>
          </template>

          <!-- ===== Rating ===== -->
          <template v-else-if="activeTab === 'rating'">
            <p class="flex items-center gap-2 text-[16px] font-semibold text-ink">
              <Icon name="trending-up" size="18" class="text-primary" />
              {{ t('portal.profile.rankTitle') }}: {{ summary?.rank ?? '—' }}
            </p>
            <div class="mt-4 overflow-x-auto rounded-lg border border-border">
              <table class="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr class="border-b border-border text-left text-ink-muted">
                    <th class="px-4 py-2.5 font-medium">{{ t('portal.profile.user') }}</th>
                    <th class="w-28 px-4 py-2.5 font-medium">{{ t('gamification.points') }}</th>
                    <th class="w-28 px-4 py-2.5 font-medium">{{ t('portal.profile.tabs.badges') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in board"
                    :key="row.userId"
                    class="h-12 border-b border-border last:border-b-0"
                    :class="row.userId === myId ? 'bg-primary/5' : ''"
                  >
                    <td class="px-4">
                      <div class="flex items-center gap-3">
                        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" :class="MEDAL[row.rank] ?? 'text-ink-muted'">{{ MEDAL[row.rank] ? row.rank : `${row.rank}.` }}</span>
                        <Avatar :name="row.fullName" :src="row.avatar" size="xs" />
                        <span class="truncate text-ink">{{ row.fullName }}</span>
                      </div>
                    </td>
                    <td class="px-4 text-ink">{{ row.totalPoints }}</td>
                    <td class="px-4 text-ink">{{ row.badgeCount ?? 0 }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!board.length" class="px-4 py-8 text-center text-[13px] text-ink-muted">{{ t('gamification.empty') }}</p>
            </div>
          </template>

          <!-- ===== Points ===== -->
          <template v-else-if="activeTab === 'points'">
            <Skeleton v-if="!pointsHistory" class="h-40 w-full rounded-lg" />
            <div v-else class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr class="border-b border-border text-left text-ink-muted">
                    <th class="w-40 px-4 py-2.5 font-medium">{{ t('portal.profile.date') }}</th>
                    <th class="px-4 py-2.5 font-medium">{{ t('portal.profile.reason') }}</th>
                    <th class="w-24 px-4 py-2.5 font-medium">{{ t('gamification.points') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in pointsHistory" :key="row.id" class="h-12 border-b border-border last:border-b-0">
                    <td class="px-4 text-ink-muted">{{ formatDate(row.earnedAt) }}</td>
                    <td class="px-4 text-ink">
                      <span class="font-medium">{{ t(`portal.profile.source.${row.source}`) }}</span>
                      <span v-if="row.itemTitle || row.courseTitle" class="text-ink-muted"> — {{ row.itemTitle || row.courseTitle }}</span>
                    </td>
                    <td class="px-4 text-ink"><span class="flex items-center gap-1"><Icon name="star" size="14" class="text-primary" />+{{ row.points }}</span></td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!pointsHistory.length" class="px-4 py-8 text-center text-[13px] text-ink-muted">{{ t('portal.profile.noPoints') }}</p>
            </div>
          </template>

          <!-- ===== Badges ===== -->
          <template v-else-if="activeTab === 'badges'">
            <div v-if="badgeCatalog?.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                v-for="badge in badgeCatalog"
                :key="badge.code"
                class="flex items-start gap-3 rounded-lg border border-border p-4"
                :class="badge.earnedAt ? '' : 'opacity-70'"
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="badge.earnedAt ? 'bg-primary/10 text-primary' : 'bg-surface-2 text-ink-faint'">
                  <Icon :name="badge.icon" size="20" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-[14px] font-semibold text-ink">{{ badgeName(badge) }}</p>
                  <p v-if="badge.description" class="mt-0.5 text-[12px] text-ink-muted">{{ badge.description }}</p>
                  <p v-if="badge.earnedAt" class="mt-1 text-[12px] text-success">{{ t('portal.profile.earnedOn', { date: formatDate(badge.earnedAt) }) }}</p>
                  <div v-else-if="badge.criteria?.length" class="mt-2 space-y-1">
                    <div v-for="criterion in badge.criteria" :key="criterion.metric">
                      <div class="flex justify-between text-[11px] text-ink-muted">
                        <span>{{ t(`portal.profile.metric.${criterion.metric}`, criterion.metric) }}</span>
                        <span>{{ criterion.current }} / {{ criterion.threshold }}</span>
                      </div>
                      <div class="mt-0.5 h-1 rounded-full bg-border">
                        <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.min(100, (criterion.current / criterion.threshold) * 100)}%` }"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="py-10 text-center text-[13px] text-ink-muted">{{ t('gamification.noBadgesYet') }}</p>
          </template>

          <!-- ===== Certificates ===== -->
          <template v-else-if="activeTab === 'certificates'">
            <div v-if="certificates?.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div v-for="certificate in certificates" :key="certificate.id" class="flex items-start gap-3 rounded-lg border border-border p-3">
                <span class="flex h-[66px] w-[96px] shrink-0 items-center justify-center rounded border border-border bg-surface-2 text-primary"><Icon name="award" size="28" /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-[15px] font-medium text-ink">{{ t('portal.profile.forCourse', { title: certificate.title }) }}</p>
                    <Badge v-if="certificate.status !== 'VALID'" :variant="statusVariant[certificate.status]" size="sm">{{ t(`certificates.status.${certificate.status}`) }}</Badge>
                  </div>
                  <p class="text-[12px] text-ink-muted">{{ formatDate(certificate.issuedAt) }}<template v-if="certificate.validUntil"> · {{ t('certificates.validUntil') }} {{ formatDate(certificate.validUntil) }}</template></p>
                  <p class="font-mono text-[11px] text-ink-faint">{{ certificate.serial }}</p>
                  <AppButton
                    v-if="certificate.status !== 'REVOKED'"
                    class="mt-2"
                    size="sm"
                    variant="secondary"
                    icon="download"
                    :loading="downloading === certificate.id"
                    @click="download(certificate)"
                  >
                    {{ t('certificates.download') }}
                  </AppButton>
                </div>
              </div>
            </div>
            <div v-else class="py-10 text-center">
              <Icon name="award" size="32" class="mx-auto text-ink-faint" />
              <p class="mt-2 text-[13px] text-ink-muted">{{ t('certificates.emptyTitle') }}</p>
            </div>
          </template>

          <!-- ===== Settings ===== -->
          <SettingsPanel v-else-if="activeTab === 'settings'" />
        </div>
      </div>
    </div>
  </div>
</template>
