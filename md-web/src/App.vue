<script setup lang="ts">
import { useConfigStore } from '@/stores/config'
const config = useConfigStore()
</script>

<template>
  <div class="app-root" :class="{ dark: config.dark }">
    <router-view />
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
}
</style>
