<script setup>
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import BottomNav from './BottomNav.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-bg">
    <Sidebar class="hidden lg:flex" />
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Topbar />
      <main class="flex-1 overflow-y-auto pb-20 lg:pb-0">
        <slot />
      </main>
    </div>
    <BottomNav class="lg:hidden" />
  </div>
</template>
