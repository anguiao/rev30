<script setup lang="ts">
import type { ResourceTreeNode } from '@rev30/shared'
import AdminMenu from '../navigation/AdminMenu.vue'
import AdminSidebarFooter from './AdminSidebarFooter.vue'
import AdminSidebarHeader from './AdminSidebarHeader.vue'

defineProps<{
  collapsed: boolean
  menus: ResourceTreeNode[]
}>()

const emit = defineEmits<{
  (event: 'toggle-collapsed'): void
}>()

function handleToggleCollapsed() {
  emit('toggle-collapsed')
}
</script>

<template>
  <aside
    data-test="admin-sidebar"
    class="sticky top-0 flex h-screen min-h-0 flex-col border-r border-stone-200 bg-white py-6 dark:border-zinc-800 dark:bg-zinc-900"
  >
    <AdminSidebarHeader :collapsed="collapsed" @toggle-collapsed="handleToggleCollapsed" />
    <AdminMenu :collapsed="collapsed" :menus="menus" />
    <AdminSidebarFooter :collapsed="collapsed" />
  </aside>
</template>
