<script setup>
/**
 * One role as a page (rasm «Редактирование роли»): back arrow and title;
 * a white card with «pick the permissions for this role» and Save on the
 * right; «Asosiy» — the name and the description; then «Kirish
 * ruxsatlari» — the permission groups as columns of tick boxes. Our
 * scope (how far the role sees) sits with the basics: the reference has
 * no such thing, and it is the one field here that closes a leak.
 *
 * A built-in role opens read-only: the name and the boxes are shown so a
 * person can see what SUPERADMIN means, and only the description — its
 * documentation — can be changed.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { roleLabel, permissionLabel, moduleLabel } from '@/utils/roleLabel'
import { rolesApi } from '@/services/roles'
import { useToast } from '@/composables/useToast'
import { apiErrorText } from '@/utils/apiError'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Icon from '@/components/ui/Icon.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const isNew = computed(() => route.name === 'admin-role-new')
const SCOPES = ['ALL', 'DEPARTMENT', 'TEAM', 'SELF']
const scopeOptions = computed(() => SCOPES.map((scope) => ({ value: scope, label: t(`roles.scopes.${scope}`) })))

const loading = ref(true)
const errorMessage = ref('')
const saving = ref(false)
const role = ref(null)
const catalogue = ref([])
const form = reactive({ name: '', description: '', scope: 'SELF', permissions: new Set() })

const isSystem = computed(() => Boolean(role.value?.isSystem))
const title = computed(() => (isNew.value ? t('roles.newRole') : t('roles.editTitle')))
const totalPermissions = computed(() => catalogue.value.reduce((n, group) => n + group.permissions.length, 0))

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [groups, roles] = await Promise.all([rolesApi.permissions(), isNew.value ? [] : rolesApi.list()])
    catalogue.value = groups
    if (!isNew.value) {
      const found = roles.find((r) => r.id === route.params.id)
      if (!found) throw new Error(t('roles.notFound'))
      role.value = found
      form.name = found.label || roleLabel(found.name, { t, te })
      form.description = found.description || (te(`roles.descriptions.${found.name}`) ? t(`roles.descriptions.${found.name}`) : '')
      form.scope = found.scope
      form.permissions = new Set(found.permissions ?? [])
    }
  } catch (error) {
    errorMessage.value = apiErrorText(error, t('roles.loadFailed'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

function has(key) {
  return form.permissions.has(key)
}
function toggle(key) {
  if (isSystem.value) return
  const next = new Set(form.permissions)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  form.permissions = next
}
function groupState(group) {
  const on = group.permissions.filter((p) => form.permissions.has(p.key)).length
  return on === 0 ? 'none' : on === group.permissions.length ? 'all' : 'some'
}
function toggleGroup(group) {
  if (isSystem.value) return
  const next = new Set(form.permissions)
  const allOn = groupState(group) === 'all'
  for (const p of group.permissions) {
    if (allOn) next.delete(p.key)
    else next.add(p.key)
  }
  form.permissions = next
}

async function save() {
  const name = form.name.trim()
  if (!name) {
    toast.error(t('roles.nameRequired'))
    return
  }
  saving.value = true
  try {
    if (isNew.value) {
      const created = await rolesApi.create({ name, scope: form.scope, description: form.description.trim(), permissions: [...form.permissions] })
      toast.success(t('roles.created'))
      router.replace(`/bos/roles/${created.id}`)
    } else if (isSystem.value) {
      role.value = await rolesApi.update(role.value.id, { description: form.description.trim() })
      toast.success(t('roles.saved'))
    } else {
      role.value = await rolesApi.update(role.value.id, {
        label: name,
        description: form.description.trim(),
        scope: form.scope,
        permissions: [...form.permissions],
      })
      toast.success(t('roles.saved'))
    }
  } catch (error) {
    toast.error(apiErrorText(error, isNew.value ? t('roles.createFailed') : t('roles.saveFailed')))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
    <div class="flex items-center gap-3">
      <router-link
        to="/bos/roles"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-default hover:bg-surface-2 hover:text-ink"
        :aria-label="t('common.back')"
      >
        <Icon name="arrow-left" size="20" />
      </router-link>
      <h1 class="truncate text-[24px] font-semibold text-ink">{{ title }}</h1>
      <Icon v-if="isSystem" name="lock" size="16" class="text-ink-faint" :title="t('roles.builtIn')" />
    </div>

    <Skeleton v-if="loading" class="mt-6 h-96 w-full rounded-xl" />
    <p v-else-if="errorMessage" class="mt-6 text-small text-danger">{{ errorMessage }}</p>

    <div v-else class="mt-5 rounded-xl border border-border bg-surface px-6 py-5 lg:px-8">
      <!-- «Выберите набор разрешений для этой роли.» + Save -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <p class="text-[14px] text-ink">{{ isSystem ? t('roles.systemHint') : t('roles.editorHint') }}</p>
        <AppButton :loading="saving" @click="save">{{ t('common.save') }}</AppButton>
      </div>

      <!-- Asosiy -->
      <h2 class="mt-7 text-[20px] font-medium text-ink">{{ t('roles.basics') }}</h2>
      <div class="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <label class="pt-2.5 text-[14px] text-ink" for="role-name"><span class="text-danger">*</span> {{ t('roles.name') }}:</label>
        <input
          id="role-name"
          v-model="form.name"
          type="text"
          maxlength="40"
          :readonly="isSystem"
          :placeholder="t('roles.namePlaceholder')"
          class="h-11 w-full max-w-[560px] rounded-lg border border-border-strong bg-surface px-3.5 text-[15px] text-ink outline-none transition-default focus:border-primary focus:ring-1 focus:ring-primary read-only:bg-surface-2"
        />

        <label class="pt-2.5 text-[14px] text-ink" for="role-description">{{ t('roles.description') }}:</label>
        <textarea
          id="role-description"
          v-model="form.description"
          rows="3"
          maxlength="500"
          :placeholder="t('roles.descriptionPlaceholder')"
          class="w-full max-w-[560px] rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition-default focus:border-primary focus:ring-1 focus:ring-primary"
        />

        <label class="pt-2.5 text-[14px] text-ink" for="role-scope">{{ t('roles.scope') }}:</label>
        <div class="w-full max-w-[560px]">
          <AppSelect id="role-scope" v-model="form.scope" :options="scopeOptions" :disabled="isSystem" />
          <p class="mt-1.5 text-[13px] text-ink-faint">{{ t(`roles.scopeHints.${form.scope}`) }}</p>
        </div>
      </div>

      <!-- Kirish ruxsatlari -->
      <div class="mt-9 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-[20px] font-medium text-ink">{{ t('roles.access') }}</h2>
        <span class="text-[13px] text-ink-faint">{{ t('roles.selectedCount', { count: form.permissions.size, total: totalPermissions }) }}</span>
      </div>
      <div class="mt-5 grid gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        <section v-for="group in catalogue" :key="group.module">
          <button
            type="button"
            class="mb-3 flex items-center gap-2 text-[16px] font-medium text-ink"
            :class="isSystem ? 'cursor-default' : 'hover:text-primary'"
            :title="isSystem ? '' : t('roles.toggleGroup')"
            @click="toggleGroup(group)"
          >
            {{ moduleLabel(group.module, { t, te }) }}
            <span v-if="groupState(group) === 'some'" class="text-[12px] font-normal text-ink-faint">{{ group.permissions.filter((p) => has(p.key)).length }}/{{ group.permissions.length }}</span>
          </button>
          <label
            v-for="permission in group.permissions"
            :key="permission.key"
            class="flex items-start gap-2.5 py-1.5"
            :class="isSystem ? 'cursor-default' : 'cursor-pointer'"
          >
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-primary disabled:opacity-60"
              :checked="has(permission.key)"
              :disabled="isSystem"
              @change="toggle(permission.key)"
            />
            <span class="text-[14px] leading-snug text-ink" :title="permission.key">{{ permissionLabel(permission.key, { t, te }) }}</span>
          </label>
        </section>
      </div>
    </div>
  </div>
</template>
