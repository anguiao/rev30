<script setup lang="ts">
import { computed } from 'vue'
import { NTooltip } from 'naive-ui'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (event: 'toggle-collapsed'): void
}>()

const sidebarToggleLabel = computed(() => (props.collapsed ? '展开侧边栏' : '收起侧边栏'))

function handleToggleCollapsed() {
  emit('toggle-collapsed')
}
</script>

<template>
  <header data-test="admin-sidebar-header" class="relative mb-6 h-20">
    <div
      data-test="admin-sidebar-header-content"
      class="flex h-full"
      :class="
        collapsed ? 'flex-col items-center gap-2 px-3' : 'items-start justify-between gap-3 px-5'
      "
    >
      <div v-if="collapsed" data-test="admin-sidebar-brand-mark">
        <span
          class="grid size-8 place-items-center rounded-lg bg-primary-muted text-sm font-semibold text-primary"
        >
          R
        </span>
      </div>
      <div v-else data-test="admin-sidebar-brand">
        <p class="text-lg font-semibold">Rev30</p>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">后台管理</p>
      </div>
      <NTooltip trigger="hover" placement="right">
        <template #trigger>
          <button
            data-test="admin-sidebar-toggle"
            type="button"
            :aria-label="sidebarToggleLabel"
            class="grid size-6 shrink-0 cursor-pointer place-items-center text-stone-500 transition-colors hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid dark:text-zinc-400 dark:hover:text-zinc-100"
            :class="collapsed ? '' : 'mt-0.5'"
            @click="handleToggleCollapsed"
          >
            <span
              data-test="admin-sidebar-toggle-icon"
              class="inline-block"
              :class="
                collapsed
                  ? 'i-[lucide--panel-left-open] size-4.5'
                  : 'i-[lucide--panel-left-close] size-4'
              "
              aria-hidden="true"
            />
          </button>
        </template>
        {{ sidebarToggleLabel }}
      </NTooltip>
    </div>
    <div
      data-test="admin-sidebar-header-separator"
      class="absolute bottom-0 border-b border-stone-200 dark:border-zinc-800"
      :class="collapsed ? 'right-3 left-3' : 'right-5 left-5'"
    />
  </header>
</template>
