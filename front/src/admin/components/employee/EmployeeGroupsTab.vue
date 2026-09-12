<script setup>
/**
 * Groups this person is in (rasm: "Участие в группах") — one greyed chip
 * per group, and a way to add them to another or take them out.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { groupsApi } from '@/services/groups'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import BulkGroupMembersModal from '@/admin/components/users/BulkGroupMembersModal.vue'
import TabError from './TabError.vue'

const props = defineProps({
  user: { type: Object, required: true },
})

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()

const loading = ref(true)
const errorMessage = ref('')
const groups = ref([])
const addOpen = ref(false)
const removing = ref('')

const canManage = computed(() => auth.hasPermission('course:assign'))
const users = computed(() => [props.user])

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const all = await groupsApi.list({})
    groups.value = all.filter((g) => (g.memberIds ?? []).includes(props.user.id))
  } catch (error) {
    errorMessage.value = apiErrorText(error)
  } finally {
    loading.value = false
  }
}

async function remove(group) {
  removing.value = group.id
  try {
    await groupsApi.removeMember(group.id, props.user.id)
    toast.success(t('users.bulk.removedFromGroup', { count: 1, name: group.name }))
    await load()
  } catch (error) {
    toast.error(apiErrorText(error))
  } finally {
    removing.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-4 border-b border-border pb-4">
      <p class="text-[15px] text-ink">{{ t('employee.groups.hint') }}</p>
      <AppButton v-if="canManage" icon="plus" @click="addOpen = true">{{ t('employee.groups.add') }}</AppButton>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-y-2 sm:grid-cols-[200px_minmax(0,480px)] sm:gap-x-6">
      <span class="text-small text-ink-muted sm:pt-2">{{ t('employee.tabs.groups') }}</span>
      <div>
        <div v-if="loading" class="space-y-2"><Skeleton v-for="i in 3" :key="i" class="h-9 w-full" /></div>
        <TabError v-else-if="errorMessage" :message="errorMessage" @retry="load" />
        <p v-else-if="!groups.length" class="pt-2 text-small text-ink-faint">{{ t('employee.groups.empty') }}</p>
        <ul v-else class="space-y-2">
          <li v-for="group in groups" :key="group.id" class="flex items-center gap-2">
            <button
              type="button"
              class="flex h-9 min-w-0 flex-1 items-center rounded-md border border-border bg-surface-2 px-3 text-left text-small text-ink-muted transition-default hover:text-ink"
              @click="router.push(`/bos/groups/${group.id}`)"
            >
              <span class="truncate">{{ group.name }}</span>
            </button>
            <button
              v-if="canManage"
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-faint transition-default hover:bg-surface-2 hover:text-danger"
              :aria-label="t('employee.groups.remove')"
              :disabled="removing === group.id"
              @click="remove(group)"
            >
              <Icon name="close" size="15" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <BulkGroupMembersModal v-model="addOpen" mode="add" :users="users" @done="load" />
  </div>
</template>
