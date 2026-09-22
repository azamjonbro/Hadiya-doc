<script setup>
/**
 * The section column (rasn 2, 6, 11, 21…): the section's name in 22px,
 * then its pages, the current one on a grey pill. Rendered only when the
 * section has more than one page the person may open.
 *
 * The materials section carries one more block (rasm «Учебные материалы»):
 * «LOYIHALAR» with a "+" beside it and the projects underneath — folders
 * the library is split into so three teams' drafts stop landing in one
 * heap. "+" makes the folder at once, named after the person, and opens
 * the management dialog over it, the way the reference does.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProjectsStore } from '@/stores/projects'
import { useToast } from '@/composables/useToast'
import { projectsApi } from '@/services/projects'
import { apiErrorText } from '@/utils/apiError'
import Icon from '@/components/ui/Icon.vue'
import Tooltip from '@/components/ui/Tooltip.vue'

const props = defineProps({ section: { type: Object, required: true }, pages: { type: Array, required: true } })
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const toast = useToast()

// The longest matching page wins, so /bos/ojt/sessions lights "sessions"
// and not the checklists page at /bos/ojt as well.
const activePath = computed(() => {
  let best = ''
  for (const page of props.pages) {
    const hit = route.path === page.path || route.path.startsWith(`${page.path}/`)
    if (hit && page.path.length > best.length) best = page.path
  }
  return best
})
function isActive(path) {
  return activePath.value === path
}

const showProjects = computed(() => props.section.key === 'materials' && auth.hasPermission('course:read'))
watch(
  showProjects,
  (show) => {
    if (show) projects.load()
  },
  { immediate: true },
)

const activeProjectId = computed(() => (route.path.startsWith('/bos/projects/') ? String(route.params.id ?? '') : ''))

let creating = false
async function createProject() {
  if (creating) return
  creating = true
  try {
    const project = await projectsApi.create()
    projects.upsert(project)
    router.push({ path: `/bos/projects/${project.id}`, query: { manage: '1' } })
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    creating = false
  }
}
</script>

<template>
  <aside class="flex w-[248px] shrink-0 flex-col px-3 pt-6">
    <h2 class="px-3 text-[22px] font-semibold leading-tight text-ink">{{ t(section.labelKey) }}</h2>
    <ul class="mt-5 space-y-0.5">
      <li v-for="page in pages" :key="page.name">
        <router-link
          :to="page.path"
          class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition-default"
          :class="isActive(page.path) ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
          :aria-current="isActive(page.path) ? 'page' : undefined"
        >
          <Icon v-if="page.icon" :name="page.icon" size="18" class="shrink-0" />
          {{ t(page.labelKey) }}
        </router-link>
      </li>
    </ul>

    <template v-if="showProjects">
      <div class="mt-6 flex items-center justify-between px-3">
        <span class="text-[12px] font-semibold uppercase tracking-wider text-ink-muted">{{ t('projects.title') }}</span>
        <Tooltip v-if="auth.hasPermission('course:create')" :text="t('projects.add')" position="left">
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-default hover:bg-surface-hover hover:text-ink"
            :aria-label="t('projects.add')"
            @click="createProject"
          >
            <Icon name="plus" size="16" />
          </button>
        </Tooltip>
      </div>
      <ul class="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-4" :aria-label="t('projects.title')">
        <li v-for="project in projects.items" :key="project.id">
          <router-link
            :to="`/bos/projects/${project.id}`"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] transition-default"
            :class="activeProjectId === project.id ? 'bg-surface-hover font-medium text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'"
            :aria-current="activeProjectId === project.id ? 'page' : undefined"
            :title="project.name"
          >
            <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
            <span v-if="project.courseCount" class="shrink-0 text-[12px] text-ink-faint">{{ project.courseCount }}</span>
          </router-link>
        </li>
        <li v-if="projects.loaded && !projects.items.length" class="px-3 py-2 text-[13px] text-ink-faint">
          {{ t('projects.none') }}
        </li>
      </ul>
    </template>
  </aside>
</template>
