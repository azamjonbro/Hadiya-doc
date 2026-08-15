<script setup>
// The whole chat experience lives in ChatWorkspace so the employee app and
// the admin app run exactly the same client — a DM between two employees
// and a DM between an admin and an employee are the same thing, and having
// two implementations would guarantee they drift.
import ChatWorkspace from '@/components/chat/ChatWorkspace.vue'
</script>

<template>
  <ChatWorkspace />
</template>
