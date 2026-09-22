<script setup>
/**
 * The course library (rasm 1–3, «Библиотека курсов»).
 *
 * The reference sells ready-made courses here; we have no marketplace, so
 * the same page shows the company's own ready courses — everything
 * published, shelved by category with a cover, the way a catalogue is
 * browsed rather than a table is filtered. The right column lists the
 * shelves; a chip scrolls to its shelf. The two buttons on the right of
 * the title map onto what we can actually do: «Kurs buyurtma qilish» leads
 * to the AI course builder instead of a sales call, and «Boshqa tillardagi
 * kurslar» shows the courses that carry an approved translation.
 *
 * The second tab lists the external libraries the reference integrates
 * with. None is connected; the cards say so and link to the vendor, so a
 * person deciding on one has the facts and no false button.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { coursesApi } from '@/services/courses'
import { useAuthStore } from '@/stores/auth'
import { apiErrorText } from '@/utils/apiError'
import Tabs from '@/components/ui/Tabs.vue'
import Modal from '@/components/ui/Modal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const tab = ref('ready')
const tabs = computed(() => [
  { value: 'ready', label: t('library.tabs.ready') },
  { value: 'external', label: t('library.tabs.external') },
])

const loading = ref(true)
const errorMessage = ref('')
const courses = ref([])
const categories = ref([])
const languages = ref([])
const UNSHELVED = '__none'

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [list, cats, langs] = await Promise.all([
      coursesApi.list({ page: 1, limit: 100, status: 'PUBLISHED' }),
      coursesApi.categories(),
      coursesApi.languages().catch(() => []),
    ])
    courses.value = list.items
    categories.value = cats
    languages.value = langs
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Shelves: one per category that has a published course, in the
// catalogue's order, and one more at the end for courses filed in none.
const shelves = computed(() => {
  const byCategory = new Map()
  for (const course of courses.value) {
    const key = course.categoryId ?? UNSHELVED
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(course)
  }
  const rows = categories.value
    .filter((category) => byCategory.has(category.id))
    .map((category) => ({ id: category.id, name: category.name, color: category.color, courses: byCategory.get(category.id) }))
  if (byCategory.has(UNSHELVED)) {
    rows.push({ id: UNSHELVED, name: t('library.unshelved'), color: '#64748b', courses: byCategory.get(UNSHELVED) })
  }
  return rows
})

// The chip column narrows the page to one shelf; "all" puts it back.
const activeShelf = ref('')
const visibleShelves = computed(() => (activeShelf.value ? shelves.value.filter((s) => s.id === activeShelf.value) : shelves.value))
async function pickShelf(id) {
  activeShelf.value = activeShelf.value === id ? '' : id
  await nextTick()
  document.getElementById('library-shelves')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// «Boshqa tillardagi kurslar»: the published courses that have an approved
// translation, shelved by language instead of category.
const otherLanguages = ref(false)
const LANG_NAMES = { uz: 'library.lang.uz', ru: 'library.lang.ru', en: 'library.lang.en' }
const languageShelves = computed(() => {
  const byLang = new Map()
  const byId = new Map(courses.value.map((course) => [course.id, course]))
  for (const row of languages.value) {
    const course = byId.get(row.courseId)
    if (!course) continue
    for (const lang of row.langs) {
      if (!byLang.has(lang)) byLang.set(lang, [])
      byLang.get(lang).push(course)
    }
  }
  return [...byLang.entries()].map(([lang, list]) => ({ id: lang, name: t(LANG_NAMES[lang] ?? lang), color: '#6366f1', courses: list }))
})

// The banner's fan of covers: three real ones, so the page shows what it
// has rather than stock art.
const bannerCovers = computed(() => courses.value.filter((course) => course.cover).slice(0, 3).map((course) => course.cover))

const orderOpen = ref(false)
function orderCourse() {
  orderOpen.value = false
  router.push('/bos/ai')
}

// The card's "···" menu: open in the editor, or as a learner sees it.
const menuFor = ref('')
function toggleMenu(id) {
  menuFor.value = menuFor.value === id ? '' : id
}

function minutesLabel(course) {
  if (!course.estimatedMinutes) return ''
  const hours = Math.floor(course.estimatedMinutes / 60)
  const minutes = course.estimatedMinutes % 60
  return hours ? t('library.duration.hours', { h: hours, m: minutes }) : t('library.duration.minutes', { m: minutes })
}

// The external libraries the reference offers (rasm 3). Wordmarks are
// typeset, not logos: we hold no licence to theirs.
const external = [
  { key: 'go1', name: 'Go1', mark: 'go1', tone: 'text-teal-700 dark:text-teal-300', descriptionKey: 'library.external.go1', url: 'https://www.go1.com/' },
  { key: 'linkedin', name: 'LinkedIn Learning', mark: 'Linked in', tone: 'text-sky-700 dark:text-sky-300', descriptionKey: 'library.external.linkedin', url: 'https://learning.linkedin.com/' },
  { key: 'coursera', name: 'Coursera for Business', mark: 'coursera', tone: 'text-indigo-700 dark:text-indigo-300', descriptionKey: 'library.external.coursera', url: 'https://www.coursera.org/business' },
  { key: 'udemy', name: 'Udemy Business', mark: 'ûdemy', tone: 'text-violet-700 dark:text-violet-300', descriptionKey: 'library.external.udemy', url: 'https://business.udemy.com/' },
]
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <!-- Rasn 1: the title, and on the right the two grey buttons -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <h1 class="text-[24px] font-semibold text-ink">{{ t('admin.section.library') }}</h1>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="auth.hasPermission('course:create')"
          type="button"
          class="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-4 text-[14px] font-medium text-ink transition-default hover:bg-surface-hover"
          @click="orderOpen = true"
        >
          <Icon name="sparkles" size="18" class="text-ink-muted" />{{ t('library.order.button') }}
        </button>
        <button
          type="button"
          class="flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-medium transition-default"
          :class="otherLanguages ? 'bg-primary-subtle text-primary' : 'bg-surface-2 text-ink hover:bg-surface-hover'"
          :aria-pressed="otherLanguages"
          @click="otherLanguages = !otherLanguages"
        >
          <Icon name="globe" size="18" :class="otherLanguages ? '' : 'text-ink-muted'" />{{ t('library.otherLanguages') }}
        </button>
      </div>
    </div>

    <Tabs v-model="tab" :tabs="tabs" class="mt-4" />

    <p v-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <!-- ===== Ready courses ===== -->
    <template v-if="tab === 'ready'">
      <div v-if="loading" class="mt-6 space-y-4">
        <Skeleton class="h-48 w-full rounded-2xl" />
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="aspect-[4/3] w-full rounded-xl" />
        </div>
      </div>

      <template v-else>
        <!-- Rasn 1: the lavender banner with a fan of course covers -->
        <section v-if="!otherLanguages" class="relative mt-6 overflow-hidden rounded-2xl bg-violet-50 px-8 py-8 dark:bg-violet-500/10">
          <div class="relative z-10 max-w-[560px]">
            <h2 class="text-[26px] font-semibold leading-tight text-ink">{{ t('library.banner.title', { n: courses.length }) }}</h2>
            <p class="mt-3 text-[15px] leading-relaxed text-ink-muted">{{ t('library.banner.text') }}</p>
            <AppButton class="mt-5 !bg-violet-600 !text-white hover:!bg-violet-700" @click="router.push('/bos/courses')">{{ t('library.banner.cta') }}</AppButton>
          </div>
          <div v-if="bannerCovers.length" class="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 lg:block" aria-hidden="true">
            <div class="relative h-48 w-[420px]">
              <img
                v-for="(cover, index) in bannerCovers"
                :key="cover"
                :src="cover"
                alt=""
                class="absolute h-36 w-56 rounded-xl object-cover shadow-lg"
                :style="{ left: `${index * 110}px`, top: `${(index % 2) * 28}px`, transform: `rotate(${index * 4 - 6}deg)` }"
              />
            </div>
          </div>
        </section>

        <div id="library-shelves" class="mt-8 scroll-mt-24 flex flex-col gap-8 lg:flex-row lg:items-start">
          <!-- The shelves -->
          <div class="min-w-0 flex-1">
            <template v-if="otherLanguages">
              <div v-if="!languageShelves.length">
                <EmptyState icon="globe" :title="t('library.noTranslations.title')" :description="t('library.noTranslations.text')">
                  <template v-if="auth.hasPermission('course:update')" #action>
                    <AppButton variant="outline" icon="sparkles" @click="router.push('/bos/ai')">{{ t('ai.title') }}</AppButton>
                  </template>
                </EmptyState>
              </div>
              <section v-for="shelf in languageShelves" :key="shelf.id" class="mb-10">
                <h2 class="flex items-center gap-2 text-[26px] font-semibold text-ink"><Icon name="globe" size="22" class="text-ink-muted" />{{ shelf.name }}</h2>
                <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                  <article v-for="course in shelf.courses" :key="course.id" class="group relative overflow-hidden rounded-xl border border-border bg-surface transition-default hover:shadow-md">
                    <div class="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-500/15 dark:to-amber-500/5">
                      <img v-if="course.cover" :src="course.cover" alt="" class="h-full w-full object-cover" loading="lazy" />
                      <Icon v-else name="layers" size="40" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-orange-300" />
                      <div class="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/45 opacity-0 transition-default group-hover:opacity-100 group-focus-within:opacity-100">
                        <button type="button" class="rounded-lg bg-white/90 px-4 py-2 text-[14px] font-medium text-slate-900 hover:bg-white" @click="router.push(`/bos/courses/${course.id}`)">{{ t('library.view') }}</button>
                      </div>
                    </div>
                    <div class="p-4">
                      <h3 class="line-clamp-2 text-[17px] font-medium leading-snug text-ink">{{ course.title }}</h3>
                    </div>
                  </article>
                </div>
              </section>
            </template>

            <template v-else>
              <EmptyState v-if="!shelves.length" icon="book-open" :title="t('library.empty.title')" :description="t('library.empty.text')">
                <template v-if="auth.hasPermission('course:create')" #action>
                  <AppButton icon="plus" @click="router.push('/bos/courses/new')">{{ t('portal.courses.typeCourse') }}</AppButton>
                </template>
              </EmptyState>
              <section v-for="shelf in visibleShelves" :id="`shelf-${shelf.id}`" :key="shelf.id" class="mb-10 scroll-mt-24">
                <div class="flex items-baseline justify-between gap-3">
                  <h2 class="text-[26px] font-semibold text-ink">{{ shelf.name }}</h2>
                  <span class="text-[13px] text-ink-muted">{{ t('library.count', { n: shelf.courses.length }) }}</span>
                </div>
                <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                  <article
                    v-for="course in shelf.courses"
                    :key="course.id"
                    class="group relative overflow-hidden rounded-xl border border-border bg-surface transition-default hover:shadow-md"
                  >
                    <!-- Rasn 1: the cover, and on hover «Ko'rish» with a «···» beside it -->
                    <div class="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-500/15 dark:to-amber-500/5">
                      <img v-if="course.cover" :src="course.cover" alt="" class="h-full w-full object-cover" loading="lazy" />
                      <Icon v-else name="layers" size="40" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-orange-300" />
                      <div
                        class="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/45 transition-default"
                        :class="menuFor === course.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
                      >
                        <button type="button" class="rounded-lg bg-white/90 px-4 py-2 text-[14px] font-medium text-slate-900 hover:bg-white" @click="router.push(`/bos/courses/${course.id}`)">{{ t('library.view') }}</button>
                        <div class="relative">
                          <button
                            type="button"
                            class="flex h-10 w-10 items-center justify-center rounded-lg bg-white/90 text-slate-900 hover:bg-white"
                            :aria-label="t('library.more')"
                            :aria-expanded="menuFor === course.id"
                            @click="toggleMenu(course.id)"
                          >
                            <Icon name="more-horizontal" size="18" />
                          </button>
                          <div v-if="menuFor === course.id" class="absolute left-0 z-20 mt-1 w-52 rounded-xl bg-surface p-1.5 text-left shadow-xl" role="menu">
                            <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink hover:bg-surface-2" @click="router.push(`/bos/courses/${course.id}`)">
                              <Icon name="pencil" size="16" class="text-ink-muted" />{{ t('library.menu.edit') }}
                            </button>
                            <button type="button" role="menuitem" class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink hover:bg-surface-2" @click="router.push(`/courses/${course.id}`)">
                              <Icon name="eye" size="16" class="text-ink-muted" />{{ t('library.menu.asLearner') }}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="p-4">
                      <h3 class="line-clamp-2 text-[17px] font-medium leading-snug text-ink">{{ course.title }}</h3>
                      <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                        <span>{{ t(`courses.level.${course.level}`) }}</span>
                        <span v-if="minutesLabel(course)" class="flex items-center gap-1"><Icon name="clock" size="13" />{{ minutesLabel(course) }}</span>
                      </p>
                    </div>
                  </article>
                </div>
              </section>
            </template>
          </div>

          <!-- Rasn 1: the shelf list on the right, as chips -->
          <aside v-if="!otherLanguages && shelves.length" class="w-full shrink-0 lg:sticky lg:top-24 lg:w-[300px]">
            <h2 class="flex items-center gap-2 text-[20px] font-medium text-ink"><Icon name="sparkles" size="18" class="text-violet-500" />{{ t('library.shelves') }}</h2>
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full px-4 py-2 text-[14px] transition-default"
                :class="activeShelf ? 'bg-surface-2 text-ink hover:bg-surface-hover' : 'bg-primary-subtle font-medium text-primary'"
                @click="pickShelf('')"
              >
                {{ t('common.all') }}
              </button>
              <button
                v-for="shelf in shelves"
                :key="shelf.id"
                type="button"
                class="rounded-full px-4 py-2 text-[14px] transition-default"
                :class="activeShelf === shelf.id ? 'bg-primary-subtle font-medium text-primary' : 'bg-surface-2 text-ink hover:bg-surface-hover'"
                :aria-pressed="activeShelf === shelf.id"
                @click="pickShelf(shelf.id)"
              >
                {{ shelf.name }}
              </button>
            </div>
          </aside>
        </div>
      </template>
    </template>

    <!-- ===== External libraries (rasn 3) ===== -->
    <template v-else>
      <p class="mt-6 text-[15px] text-ink-muted">{{ t('library.external.intro') }}</p>
      <h2 class="mt-8 text-[26px] font-semibold text-ink">{{ t('library.external.available') }}</h2>
      <div class="mt-5 grid gap-5 md:grid-cols-2">
        <article v-for="vendor in external" :key="vendor.key" class="flex flex-col rounded-2xl border border-border bg-surface p-7">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[28px] font-bold tracking-tight" :class="vendor.tone">{{ vendor.mark }}</span>
            <span class="rounded-full border border-border px-3 py-1.5 text-[13px] text-ink-muted">{{ t('library.external.planned') }}</span>
          </div>
          <h3 class="mt-6 text-[20px] font-medium text-ink">{{ vendor.name }}</h3>
          <p class="mt-2 flex-1 text-[15px] leading-relaxed text-ink-muted">{{ t(vendor.descriptionKey) }}</p>
          <a
            :href="vendor.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-6 flex h-12 items-center justify-center rounded-lg bg-surface-2 text-[15px] font-medium text-ink transition-default hover:bg-surface-hover"
          >
            {{ t('library.external.learnMore') }}
          </a>
        </article>
      </div>
      <p class="mt-6 text-[13px] text-ink-faint">{{ t('library.external.note') }}</p>
    </template>

    <!-- Rasn 2: «Не нашли нужный курс?» -->
    <Modal v-model="orderOpen" :title="t('library.order.title')" size="md">
      <p class="text-[16px] leading-relaxed text-ink">{{ t('library.order.text') }}</p>
      <template #footer>
        <AppButton variant="secondary" @click="orderOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton class="!bg-violet-600 !text-white hover:!bg-violet-700" icon="sparkles" @click="orderCourse">{{ t('library.order.confirm') }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
