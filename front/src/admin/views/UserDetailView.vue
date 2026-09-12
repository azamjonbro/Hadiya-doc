<script setup>
/**
 * One employee, as the reference lays it out (rasm): a white header card —
 * avatar, name, the role as a chip, a status dot — with "Write" and a ⋯ of
 * actions on the right; then a card of tabs. Ours keeps the dashboard the
 * reference lacks (overview, tests, activity, tasks) beside the reference's
 * own tabs (personal info, groups, access, training, OJT, competencies,
 * achievements, certificates, plans).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { roleLabel } from '@/utils/roleLabel'
import { usersApi } from '@/services/users'
import { useAuthStore } from '@/stores/auth'
import { onClickOutside } from '@/composables/onClickOutside'
import EmployeeOverviewTab from '@/admin/components/employee/EmployeeOverviewTab.vue'
import EmployeeCoursesTab from '@/admin/components/employee/EmployeeCoursesTab.vue'
import EmployeeTestsTab from '@/admin/components/employee/EmployeeTestsTab.vue'
import EmployeeActivityTab from '@/admin/components/employee/EmployeeActivityTab.vue'
import EmployeeTasksTab from '@/admin/components/employee/EmployeeTasksTab.vue'
import EmployeeSettingsTab from '@/admin/components/employee/EmployeeSettingsTab.vue'
import EmployeeGroupsTab from '@/admin/components/employee/EmployeeGroupsTab.vue'
import EmployeeAccessTab from '@/admin/components/employee/EmployeeAccessTab.vue'
import EmployeeOjtTab from '@/admin/components/employee/EmployeeOjtTab.vue'
import EmployeeCompetenciesTab from '@/admin/components/employee/EmployeeCompetenciesTab.vue'
import EmployeeAchievementsTab from '@/admin/components/employee/EmployeeAchievementsTab.vue'
import EmployeeCertificatesTab from '@/admin/components/employee/EmployeeCertificatesTab.vue'
import EmployeePlansTab from '@/admin/components/employee/EmployeePlansTab.vue'
import UserActionsHost from '@/admin/components/users/UserActionsHost.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const user = ref(null)

const TAB_VALUES = [
  'overview',
  'personal',
  'groups',
  'access',
  'courses',
  'tests',
  'activity',
  'tasks',
  'ojt',
  'competencies',
  'achievements',
  'certificates',
  'plans',
]

// Seeded from the URL so a link to a specific tab (or a page refresh) lands
// where the manager left off, not back on the overview. `settings` was the
// old name of the personal-info tab; old links still land there.
const initial = route.query.tab === 'settings' ? 'personal' : route.query.tab
const activeTab = ref(TAB_VALUES.includes(initial) ? initial : 'overview')

const tabs = computed(() => TAB_VALUES.map((value) => ({ value, label: t(`employee.tabs.${value}`) })))

const selfUsers = computed(() => (user.value ? [user.value] : []))
const actionsHost = ref(null)
const menuOpen = ref(false)
const menuRef = ref(null)
onClickOutside(menuRef, () => (menuOpen.value = false))

function act(action) {
  menuOpen.value = false
  actionsHost.value?.open(action)
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    user.value = await usersApi.getById(route.params.id)
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

// After an action the record may be gone (delete) or changed (block,
// dismiss, department): re-read it, and leave if it is no longer there.
async function onActionDone(result) {
  if (result?.deleted > 0 || result?.deletedIds?.includes(user.value?.id)) {
    router.push('/bos/users')
    return
  }
  await load()
}

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <div class="flex items-center gap-4">
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
        :aria-label="t('common.back')"
        @click="router.push('/bos/users')"
      >
        <Icon name="arrow-left" size="20" />
      </button>
      <h1 class="text-[24px] font-semibold text-ink">{{ t('users.title') }}</h1>
    </div>

    <Skeleton v-if="loading" class="mt-4 h-28 w-full rounded-2xl" />
    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="user">
      <!-- Header card -->
      <section class="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface px-6 py-5 shadow-sm">
        <div class="flex min-w-0 items-center gap-4">
          <div class="relative shrink-0">
            <Avatar :name="user.fullName" :src="user.avatar" size="xl" />
            <span
              class="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-surface"
              :class="user.isActive ? 'bg-success' : 'bg-ink-faint'"
              :title="user.isActive ? t('users.filters.active') : t('users.filters.inactive')"
            />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-[20px] font-semibold uppercase text-ink">{{ user.fullName }}</h2>
              <Icon v-if="user.isActive" name="check-circle" size="16" class="text-success" />
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{{ roleLabel(user.role, { t, te }) }}</Badge>
              <span v-if="user.position" class="text-caption text-ink-faint">{{ user.position }}</span>
              <span v-if="user.department" class="text-caption text-ink-faint">· {{ user.department }}</span>
              <span class="text-caption text-ink-faint">· {{ user.jshshir }}</span>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <AppButton v-if="auth.hasPermission('user:read')" variant="outline" icon="send" @click="act('message')">
            {{ t('employee.message') }}
          </AppButton>
          <div ref="menuRef" class="relative">
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
              :class="menuOpen ? 'border-primary text-primary' : ''"
              :aria-label="t('users.actions.more')"
              :aria-expanded="menuOpen"
              @click="menuOpen = !menuOpen"
            >
              <Icon name="more-horizontal" size="18" />
            </button>
            <div v-if="menuOpen" class="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
              <button v-if="auth.hasPermission('course:assign')" type="button" class="menu-item" @click="act('course')"><Icon name="graduation-cap" size="15" class="text-ink-faint" /> {{ t('users.actions.course.title') }}</button>
              <button v-if="auth.hasPermission('course:assign')" type="button" class="menu-item" @click="act('event')"><Icon name="calendar" size="15" class="text-ink-faint" /> {{ t('users.actions.event.title') }}</button>
              <button v-if="auth.hasPermission('course:assign')" type="button" class="menu-item" @click="act('group')"><Icon name="users" size="15" class="text-ink-faint" /> {{ t('users.bulk.groupAdd') }}</button>
              <button v-if="auth.hasPermission('user:update')" type="button" class="menu-item" @click="act('department')"><Icon name="layers" size="15" class="text-ink-faint" /> {{ t('users.actions.department.title') }}</button>
              <template v-if="auth.hasPermission('user:delete')">
                <div class="my-1 border-t border-border" />
                <button type="button" class="menu-item" @click="act('block')"><Icon name="lock" size="15" class="text-ink-faint" /> {{ t('users.actions.block') }}</button>
                <button type="button" class="menu-item" @click="act('dismiss')"><Icon name="log-out" size="15" class="text-ink-faint" /> {{ t('users.actions.dismiss.title') }}</button>
                <button v-if="auth.isSuperAdmin" type="button" class="menu-item text-danger" @click="act('delete')"><Icon name="trash" size="15" /> {{ t('common.delete') }}</button>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- Tabs card -->
      <section class="mt-3 rounded-2xl bg-surface shadow-sm">
        <div class="flex overflow-x-auto border-b border-border px-2">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            class="-mb-px whitespace-nowrap border-b-2 px-4 py-3.5 text-[13px] transition-default"
            :class="activeTab === tab.value ? 'border-primary font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'"
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Each tab fetches its own slice on mount; keeping the inactive ones
             unmounted means opening a profile costs one request, not thirteen. -->
        <div class="p-5">
          <EmployeeOverviewTab v-if="activeTab === 'overview'" :user-id="user.id" />
          <EmployeeSettingsTab
            v-else-if="activeTab === 'personal'"
            :user="user"
            @updated="user = $event"
            @deactivated="load"
            @deleted="router.push('/bos/users')"
          />
          <EmployeeGroupsTab v-else-if="activeTab === 'groups'" :user="user" />
          <EmployeeAccessTab v-else-if="activeTab === 'access'" :user="user" @updated="user = $event" />
          <EmployeeCoursesTab v-else-if="activeTab === 'courses'" :user-id="user.id" :user="user" />
          <EmployeeTestsTab v-else-if="activeTab === 'tests'" :user-id="user.id" />
          <EmployeeActivityTab v-else-if="activeTab === 'activity'" :user-id="user.id" />
          <EmployeeTasksTab v-else-if="activeTab === 'tasks'" :user-id="user.id" />
          <EmployeeOjtTab v-else-if="activeTab === 'ojt'" :user-id="user.id" />
          <EmployeeCompetenciesTab v-else-if="activeTab === 'competencies'" :user-id="user.id" />
          <EmployeeAchievementsTab v-else-if="activeTab === 'achievements'" :user-id="user.id" />
          <EmployeeCertificatesTab v-else-if="activeTab === 'certificates'" :user-id="user.id" />
          <EmployeePlansTab v-else-if="activeTab === 'plans'" :user-id="user.id" />
        </div>
      </section>

      <UserActionsHost ref="actionsHost" :users="selfUsers" @done="onActionDone" />
    </template>
  </div>
</template>

<style scoped>
.menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.625rem;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 14px;
  color: rgb(var(--color-text));
  transition: background-color 120ms;
}
.menu-item.text-danger {
  color: rgb(var(--color-danger));
}
.menu-item:hover {
  background: rgb(var(--color-surface-2));
}
</style>
