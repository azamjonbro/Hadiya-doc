<script setup>
// Branches, and what is attached to each one.
//
// Read-only on purpose: a branch is not an entity here, it is a value that
// people and courses are tagged with (User.branch, Course.branches). New ones
// are created where they are actually used — the branch picker on the employee
// form lets you type one. Renaming would have to rewrite every tagged record in
// step, or the courses targeted at the old name would quietly stop reaching
// anyone, so it is deliberately not offered from this page.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usersApi } from '@/services/users'
import AppCard from '@/components/ui/AppCard.vue'
import Badge from '@/components/ui/Badge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Icon from '@/components/ui/Icon.vue'

const { t } = useI18n()
const router = useRouter()

const items = ref([])
const loading = ref(true)
const errorMessage = ref('')

const totals = computed(() => ({
  branches: items.value.length,
  employees: items.value.reduce((sum, b) => sum + b.employees, 0),
  courses: items.value.reduce((sum, b) => sum + b.courses, 0),
}))

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    items.value = await usersApi.branchOverview()
  } catch (error) {
    errorMessage.value = error.response?.data?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

// The employees list already filters by branch, so this page hands off rather
// than growing its own copy of that table.
function openEmployees(branch) {
  router.push({ name: 'admin-users-list', query: { branch: branch.name } })
}

function openCourses(branch) {
  router.push({ name: 'admin-courses-list', query: { branch: branch.name } })
}

onMounted(load)
</script>

<template>
  <div class="px-6 py-6">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="text-h1 text-ink">{{ t('branchesPage.title') }}</h1>
        <p class="mt-1 text-small text-ink-faint">{{ t('branchesPage.subtitle') }}</p>
      </div>
      <div v-if="!loading && items.length" class="flex gap-2 text-caption text-ink-faint">
        <span>{{ t('branchesPage.totals.branches', { count: totals.branches }) }}</span>
        <span>·</span>
        <span>{{ t('branchesPage.totals.employees', { count: totals.employees }) }}</span>
      </div>
    </div>

    <div v-if="loading" class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-28 rounded-lg" />
    </div>

    <ErrorState v-else-if="errorMessage" class="mt-6" :title="t('branchesPage.errorTitle')" :description="errorMessage">
      <template #actions>
        <AppButton variant="outline" icon="refresh" @click="load">{{ t('common.retry') }}</AppButton>
      </template>
    </ErrorState>

    <EmptyState
      v-else-if="!items.length"
      class="mt-6"
      icon="building"
      :title="t('branchesPage.empty.title')"
      :description="t('branchesPage.empty.description')"
    />

    <div v-else class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AppCard v-for="branch in items" :key="branch.name" hover>
        <div class="flex items-start gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary">
            <Icon name="building" size="18" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-body font-semibold text-ink">{{ branch.name }}</h2>
            <!-- A branch nobody is in yet is the interesting case: it means a
                 course was targeted at an office before anyone was moved into
                 it, and that course currently reaches nobody. -->
            <Badge v-if="!branch.employees" variant="warning" size="sm" class="mt-1">
              {{ t('branchesPage.noEmployees') }}
            </Badge>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-md border border-border p-2.5 text-left transition-default hover:border-border-strong hover:bg-surface-2"
            @click="openEmployees(branch)"
          >
            <p class="text-h3 leading-none text-ink">{{ branch.employees }}</p>
            <p class="mt-1 text-caption text-ink-faint">
              {{ t('branchesPage.employees') }}
              <template v-if="branch.employees && branch.activeEmployees !== branch.employees">
                · {{ t('branchesPage.activeOf', { active: branch.activeEmployees }) }}
              </template>
            </p>
          </button>

          <button
            type="button"
            class="rounded-md border border-border p-2.5 text-left transition-default hover:border-border-strong hover:bg-surface-2"
            @click="openCourses(branch)"
          >
            <p class="text-h3 leading-none text-ink">{{ branch.courses }}</p>
            <p class="mt-1 text-caption text-ink-faint">{{ t('branchesPage.courses') }}</p>
          </button>
        </div>
      </AppCard>
    </div>
  </div>
</template>
