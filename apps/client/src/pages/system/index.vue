<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { adminDefaultRoute } from '../../router/guards'

const router = useRouter()

onMounted(() => {
  void router.replace(adminDefaultRoute)
})
</script>

<template>
  <main class="min-h-screen bg-white dark:bg-slate-950" />
</template>
