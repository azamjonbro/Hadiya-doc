<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usersApi } from '@/services/users'
import EmployeeOverviewTab from '@/admin/components/employee/EmployeeOverviewTab.vue'
import EmployeeCoursesTab from '@/admin/components/employee/EmployeeCoursesTab.vue'
import EmployeeTestsTab from '@/admin/components/employee/EmployeeTestsTab.vue'
import EmployeeActivityTab from '@/admin/components/employee/EmployeeActivityTab.vue'
import EmployeeTasksTab from '@/admin/components/employee/EmployeeTasksTab.vue'
import EmployeeSettingsTab from '@/admin/components/employee/EmployeeSettingsTab.vue'
import AppButton from '@/components/ui/AppButton.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'
import { apiErrorText } from '@/utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const user = ref(null)

const TAB_VALUES = ['overview', 'courses', 'tests', 'activity', 'tasks', 'settings']

// Seeded from the URL so a link to a specific tab (or a page refresh) lands
// where the manager left off, not back on the overview.
const activeTab = ref(TAB_VALUES.includes(route.query.tab) ? route.query.tab : 'overview')

const tabs = computed(() => [
  { value: 'overview', label: t('employee.tabs.overview') },
  { value: 'courses', label: t('employee.tabs.courses') },
  { value: 'tests', label: t('employee.tabs.tests') },
  { value: 'activity', label: t('employee.tabs.activity') },
  { value: 'tasks', label: t('employee.tabs.tasks') },
  { value: 'settings', label: t('employee.tabs.settings') },
])

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

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
    <button
      type="button"
      class="flex items-center gap-1.5 text-small font-medium text-ink-muted transition-default hover:text-ink"
      @click="router.push('/bos/users')"
    >
      <Icon name="chevron-left" size="16" />
      {{ t('users.title') }}
    </button>

    <Skeleton v-if="loading" class="mt-5 h-24 w-full" />
    <p v-else-if="errorMessage" class="mt-4 text-small text-danger">{{ errorMessage }}</p>

    <template v-else-if="user">
      <div class="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-4">
          <Avatar :name="user.fullName" :src="user.avatar" size="xl" />
          <div>
            <h1 class="text-[24px] font-semibold text-ink">{{ user.fullName }}</h1>
            <p class="mt-1 text-small text-ink-muted">{{ user.jshshir }}<template v-if="user.email"> · {{ user.email }}</template></p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{{ user.role }}</Badge>
              <Badge :variant="user.isActive ? 'success' : 'danger'" dot>
                {{ user.isActive ? t('users.filters.active') : t('users.filters.inactive') }}
              </Badge>
              <span v-if="user.position" class="text-caption text-ink-faint">{{ user.position }}</span>
              <span v-if="user.department" class="text-caption text-ink-faint">· {{ user.department }}</span>
            </div>
          </div>
        </div>

        <AppButton
          variant="outline"
          icon="settings"
          :aria-pressed="activeTab === 'settings'"
          @click="activeTab = 'settings'"
        >
          {{ t('employee.tabs.settings') }}
        </AppButton>
      </div>

      <div class="mt-7">
        <Tabs v-model="activeTab" :tabs="tabs" />
      </div>

      <!-- Each tab fetches its own slice on mount; keeping the inactive ones
           unmounted means opening a profile costs one request, not six. -->
      <div class="mt-6">
        <EmployeeOverviewTab v-if="activeTab === 'overview'" :user-id="user.id" />
        <EmployeeCoursesTab v-else-if="activeTab === 'courses'" :user-id="user.id" />
        <EmployeeTestsTab v-else-if="activeTab === 'tests'" :user-id="user.id" />
        <EmployeeActivityTab v-else-if="activeTab === 'activity'" :user-id="user.id" />
        <EmployeeTasksTab v-else-if="activeTab === 'tasks'" :user-id="user.id" />
        <EmployeeSettingsTab
          v-else-if="activeTab === 'settings'"
          :user="user"
          @updated="user = $event"
          @deactivated="router.push('/bos/users')"
        />
      </div>
    </template>
  </div>
</template>
