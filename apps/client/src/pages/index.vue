<route lang="yaml">
name: false
</route>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import AdminLayout from '../components/admin/AdminLayout.vue'
</script>

<template>
  <AdminLayout>
    <RouterView />
  </AdminLayout>
</template>
