<script setup>
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import ToastHost from '@/components/ui/ToastHost.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CommandPalette from '@/components/ui/CommandPalette.vue'
import { useAuthStore } from '@/stores/auth'

const theme = useThemeStore()
const auth = useAuthStore()
onMounted(() => theme.apply())
</script>

<template>
  <router-view />
  <ToastHost />
  <ConfirmDialog />
  <!-- Mounted once at the root rather than per shell: Ctrl+K has to work
       on the login screen's sibling routes too, and two instances would
       both answer the shortcut. Only for a signed-in session — the search
       endpoint needs a token. -->
  <CommandPalette v-if="auth.accessToken" />
</template>
