<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import AdminBreadcrumb from './navigation/AdminBreadcrumb.vue'
import AdminSidebar from './sidebar/AdminSidebar.vue'

const auth = useAuthStore()
const { menus } = storeToRefs(auth)
const isSidebarCollapsed = ref(false)

const sidebarWidth = computed(() => (isSidebarCollapsed.value ? '64px' : '256px'))
const shellStyle = computed(() => ({
  '--admin-sidebar-width': sidebarWidth.value,
}))

function toggleSidebarCollapsed() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100">
    <div
      data-test="admin-shell"
      class="mx-auto grid min-h-screen min-w-0 grid-cols-[var(--admin-sidebar-width)_minmax(0,1fr)] transition-[grid-template-columns] duration-200 ease-out"
      :style="shellStyle"
    >
      <AdminSidebar
        :collapsed="isSidebarCollapsed"
        :resources="menus"
        @toggle-collapsed="toggleSidebarCollapsed"
      />

      <main class="min-w-0 overflow-x-auto p-6">
        <AdminBreadcrumb :resources="menus" class="mb-5" />
        <slot />
      </main>
    </div>
  </div>
</template>
