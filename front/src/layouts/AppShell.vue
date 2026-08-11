<script setup>
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import BottomNav from './BottomNav.vue'
</script>

<template>
  <div class="flex min-h-screen bg-bg">
    <Sidebar class="sticky top-0 hidden h-screen lg:flex" />
    <div class="flex min-w-0 flex-1 flex-col">
      <Topbar class="sticky top-0 z-20" />
      <main class="flex-1 pb-20 lg:pb-0">
        <router-view />
      </main>
    </div>
    <BottomNav class="lg:hidden" />
  </div>
</template>
