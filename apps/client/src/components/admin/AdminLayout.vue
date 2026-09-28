<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import AdminBreadcrumb from './navigation/AdminBreadcrumb.vue'
import MenuSearchDialog from './navigation/MenuSearchDialog.vue'
import AdminSidebar from './sidebar/AdminSidebar.vue'

const auth = useAuthStore()
const { menus, visibleMenus } = storeToRefs(auth)

const ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY = 'admin-sidebar-collapsed'
const isSidebarCollapsed = useStorage(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY, false)
const isMenuSearchOpen = ref(false)
const menuSearchDialog = ref<InstanceType<typeof MenuSearchDialog> | null>(null)
const usesMacShortcut = navigator.platform.startsWith('Mac')
const shortcutLabel = usesMacShortcut ? '⌘K' : 'Ctrl+K'

function openMenuSearch() {
  if (isMenuSearchOpen.value) {
    menuSearchDialog.value?.focusInput()
    return
  }

  isMenuSearchOpen.value = true
}

function handleShortcut(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.key.toLowerCase() !== 'k' ||
    event.altKey ||
    event.shiftKey ||
    (usesMacShortcut ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)
  ) {
    return
  }

  if (!isMenuSearchOpen.value) {
    const target = event.target
    if (
      (target instanceof Element &&
        target.closest(
          '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]',
        )) ||
      document.querySelector('[role="dialog"], [role="alertdialog"]')
    ) {
      return
    }
  }

  event.preventDefault()
  openMenuSearch()
}

onMounted(() => window.addEventListener('keydown', handleShortcut))
onUnmounted(() => window.removeEventListener('keydown', handleShortcut))

function toggleSidebarCollapsed() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

const sidebarWidth = computed(() => (isSidebarCollapsed.value ? '60px' : '256px'))
const shellStyle = computed(() => ({
  '--admin-sidebar-width': sidebarWidth.value,
}))
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100">
    <div
      class="mx-auto grid min-h-screen min-w-0 grid-cols-[var(--admin-sidebar-width)_minmax(0,1fr)] transition-[grid-template-columns] duration-200 ease-out"
      :style="shellStyle"
    >
      <AdminSidebar
        :collapsed="isSidebarCollapsed"
        :menus="visibleMenus"
        :shortcut-label="shortcutLabel"
        @toggle-collapsed="toggleSidebarCollapsed"
        @open-menu-search="openMenuSearch"
      />

      <main class="min-w-0 overflow-x-auto p-6">
        <AdminBreadcrumb :menus="menus" class="mb-5" />
        <slot />
      </main>
    </div>
    <MenuSearchDialog
      ref="menuSearchDialog"
      v-model:show="isMenuSearchOpen"
      :menus="visibleMenus"
    />
  </div>
</template>
