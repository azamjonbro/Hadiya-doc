<script setup>
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
</script>

<template>
  <div class="flex min-h-screen bg-bg">
    <Sidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <Topbar class="sticky top-0 z-20" />
      <main class="flex-1">
        <router-view />
      </main>
    </div>
  </div>
</template>
