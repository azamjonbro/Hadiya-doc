import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { roleLabel } from '@/utils/roleLabel'
import { ORG_LIST_TYPES, ORG_LIST_TYPE_VALUES } from '@lms/shared'
import { orgListsApi } from '@/services/orgLists'
import { rolesApi } from '@/services/roles'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'

/**
 * The org chart's vocabulary — roles, job titles, departments, subdivisions
 * and countries — loaded once and shared by everything that offers them: the
 * employee form, the employee edit tab, and the filters above the list.
 *
 * It lives here rather than in each view because the three would otherwise
 * drift: a role added from the form has to appear in the filter's dropdown on
 * the same page without a reload, and that only holds if they read one source.
 *
 * Add and remove refresh the affected list rather than patching it locally.
 * The server decides what a name normalises to (roles are upper-cased, spaces
 * become underscores) and whether a row is still in use, and guessing either
 * client-side is how a dropdown starts disagreeing with the database.
 */
export function useOrgDirectory() {
  const { t, te } = useI18n()
  const toast = useToast()

  const roles = ref([])
  const lists = reactive(Object.fromEntries(ORG_LIST_TYPE_VALUES.map((type) => [type, []])))

  async function loadRoles() {
    try {
      roles.value = await rolesApi.list()
    } catch {
      roles.value = []
    }
  }

  async function loadList(type) {
    try {
      lists[type] = await orgListsApi.list(type)
    } catch {
      lists[type] = []
    }
  }

  function loadAll() {
    return Promise.all([loadRoles(), ...ORG_LIST_TYPE_VALUES.map(loadList)])
  }

  const roleOptions = computed(() =>
    roles.value.map((role) => ({
      value: role.name,
      label: roleLabel(role.name, { t, te }),
      id: role.id,
      // Built-in roles are wired into the code, and a role somebody holds
      // would leave those accounts pointing at nothing.
      deletable: !role.isSystem && role.users === 0,
      count: role.users,
    }))
  )

  function optionsFor(type) {
    return (lists[type] ?? []).map((entry) => ({
      value: entry.name,
      label: entry.name,
      id: entry.id,
      // No id means the value only exists because somebody is filed under it —
      // it was typed into the form before this list did. Nothing to delete.
      deletable: Boolean(entry.id) && !entry.inUse,
    }))
  }

  async function addEntry(type, name) {
    try {
      await orgListsApi.create(type, name)
      await loadList(type)
      return true
    } catch (error) {
      toast.error(apiErrorText(error, t('orgLists.addFailed')))
      return false
    }
  }

  async function removeEntry(type, id) {
    try {
      await orgListsApi.remove(type, id)
      await loadList(type)
      return true
    } catch (error) {
      toast.error(apiErrorText(error, t('orgLists.removeFailed')))
      return false
    }
  }

  async function addRole(name) {
    try {
      await rolesApi.create(name)
      await loadRoles()
      return true
    } catch (error) {
      toast.error(apiErrorText(error, t('orgLists.addFailed')))
      return false
    }
  }

  async function removeRole(id) {
    try {
      await rolesApi.remove(id)
      await loadRoles()
      return true
    } catch (error) {
      toast.error(apiErrorText(error, t('orgLists.removeFailed')))
      return false
    }
  }

  return {
    ORG_LIST_TYPES,
    roles,
    roleOptions,
    optionsFor,
    loadAll,
    loadRoles,
    loadList,
    addEntry,
    removeEntry,
    addRole,
    removeRole,
  }
}
