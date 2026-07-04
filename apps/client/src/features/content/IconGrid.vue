<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import type { IconItem } from '@rev30/contracts'

const props = withDefaults(
  defineProps<{
    icons: IconItem[]
    scope: 'all' | 'single'
    renamable?: boolean
    deletable?: boolean
  }>(),
  {
    renamable: false,
    deletable: false,
  },
)

const emit = defineEmits<{
  copy: [icon: string]
  copySvg: [svg: string]
  rename: [icon: IconItem]
  delete: [icon: IconItem]
}>()

const showIconSetName = computed(() => props.scope === 'all')

function getViewBox(width: number, height: number) {
  return `0 0 ${width} ${height}`
}

function getIconSvg(icon: IconItem) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${getViewBox(icon.width, icon.height)}" width="${icon.width}" height="${icon.height}" fill="currentColor">${icon.body}</svg>`
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,7rem)] gap-2">
    <div
      v-for="icon in icons"
      :key="icon.icon"
      data-test="icon-grid-item"
      class="group flex h-32 w-28 flex-col overflow-hidden rounded-ui border border-transparent bg-transparent p-2 transition-colors hover:border-primary/60 hover:bg-stone-50 dark:hover:bg-zinc-900"
    >
      <div class="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-1">
        <div
          class="flex size-12 shrink-0 items-center justify-center text-stone-700 transition-colors group-hover:text-primary dark:text-zinc-200"
        >
          <svg
            class="size-8"
            :viewBox="getViewBox(icon.width, icon.height)"
            fill="currentColor"
            aria-hidden="true"
          >
            <g v-html="icon.body" />
          </svg>
        </div>

        <div class="w-full min-w-0 shrink-0">
          <span
            data-test="icon-grid-name"
            class="flex w-full min-w-0 justify-center overflow-hidden text-xs leading-4 font-medium text-stone-700 dark:text-zinc-200"
            :title="icon.icon"
          >
            <span class="block max-w-full min-w-0 truncate text-left">
              {{ icon.name }}
            </span>
          </span>

          <span
            v-if="showIconSetName"
            data-test="icon-grid-set"
            class="mt-0.5 flex w-full min-w-0 justify-center overflow-hidden text-[11px] leading-4 text-stone-400 dark:text-zinc-500"
            :title="icon.setName"
          >
            <span class="block max-w-full min-w-0 truncate text-left">
              {{ icon.setName }}
            </span>
          </span>
        </div>
      </div>

      <div
        data-test="icon-grid-actions"
        class="pointer-events-none mt-0.5 flex items-center justify-center gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
      >
        <NButton
          quaternary
          circle
          size="tiny"
          aria-label="复制图标名称"
          title="复制名称"
          @click.stop="emit('copy', icon.icon)"
        >
          <span class="i-[lucide--copy] text-xs" aria-hidden="true" />
        </NButton>

        <NButton
          quaternary
          circle
          size="tiny"
          aria-label="复制 SVG"
          title="复制 SVG"
          @click.stop="emit('copySvg', getIconSvg(icon))"
        >
          <span class="i-[lucide--code-xml] text-xs" aria-hidden="true" />
        </NButton>

        <NButton
          v-if="renamable"
          quaternary
          circle
          size="tiny"
          aria-label="重命名图标"
          title="重命名"
          @click.stop="emit('rename', icon)"
        >
          <span class="i-[lucide--pencil-line] text-xs" aria-hidden="true" />
        </NButton>

        <NButton
          v-if="deletable"
          quaternary
          circle
          size="tiny"
          aria-label="删除图标"
          title="删除"
          @click.stop="emit('delete', icon)"
        >
          <span class="i-[lucide--trash-2] text-xs" aria-hidden="true" />
        </NButton>
      </div>
    </div>
  </div>
</template>
