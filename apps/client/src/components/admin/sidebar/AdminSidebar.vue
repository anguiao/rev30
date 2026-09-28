<script setup lang="ts">
import type { ResourceTreeNode } from '@rev30/contracts'
import AdminMenu from '../navigation/AdminMenu.vue'
import AdminSidebarFooter from './AdminSidebarFooter.vue'
import AdminSidebarHeader from './AdminSidebarHeader.vue'

defineProps<{
  collapsed: boolean
  menus: ResourceTreeNode[]
  shortcutLabel: string
}>()

const emit = defineEmits<{
  (event: 'toggle-collapsed'): void
  (event: 'open-menu-search'): void
}>()

function handleToggleCollapsed() {
  emit('toggle-collapsed')
}

function openMenuSearch() {
  emit('open-menu-search')
}
</script>

<template>
  <aside
    data-test="admin-sidebar"
    class="sticky top-0 flex h-screen min-h-0 flex-col border-r border-stone-200 bg-white py-6 dark:border-zinc-800 dark:bg-zinc-900"
  >
    <AdminSidebarHeader :collapsed="collapsed" @toggle-collapsed="handleToggleCollapsed" />
    <button
      type="button"
      aria-label="搜索菜单"
      :title="`搜索菜单 (${shortcutLabel})`"
      class="mb-3 flex shrink-0 cursor-pointer items-center rounded-lg border border-stone-200 text-sm text-stone-600 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-primary dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      :class="collapsed ? 'mx-auto size-9 justify-center' : 'mx-3 gap-2 px-3 py-2'"
      @click="openMenuSearch"
    >
      <span class="i-[lucide--search] size-4 shrink-0" aria-hidden="true" />
      <template v-if="!collapsed">
        <span class="min-w-0 flex-1 text-left">搜索菜单</span>
        <kbd class="text-xs text-stone-500 dark:text-zinc-400">{{ shortcutLabel }}</kbd>
      </template>
    </button>
    <AdminMenu :collapsed="collapsed" :menus="menus" />
    <AdminSidebarFooter :collapsed="collapsed" />
  </aside>
</template>
