<script setup lang="ts">
import { NButton, NTooltip } from 'naive-ui'
import type { CustomIconItem, IconSetRenderableIcon } from '@rev30/contracts'

const props = withDefaults(
  defineProps<{
    icons: Array<IconSetRenderableIcon | CustomIconItem>
    editable: boolean
    showSetName?: boolean
    canRename?: boolean
    canDelete?: boolean
  }>(),
  {
    showSetName: false,
    canRename: true,
    canDelete: true,
  },
)

const emit = defineEmits<{
  copy: [icon: string]
  rename: [icon: CustomIconItem]
  delete: [icon: CustomIconItem]
}>()

function getViewBox(width: number, height: number) {
  return `0 0 ${width} ${height}`
}

function handleCopy(icon: string) {
  emit('copy', icon)
}

function handleRename(icon: IconSetRenderableIcon | CustomIconItem) {
  if (!props.editable || !props.canRename) {
    return
  }

  emit('rename', icon as CustomIconItem)
}

function handleDelete(icon: IconSetRenderableIcon | CustomIconItem) {
  if (!props.editable || !props.canDelete) {
    return
  }

  emit('delete', icon as CustomIconItem)
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,7rem)] gap-2">
    <component
      :is="editable ? 'div' : 'button'"
      v-for="icon in icons"
      :key="icon.icon"
      data-test="icon-grid-item"
      :type="editable ? undefined : 'button'"
      :aria-label="editable ? undefined : `复制图标 ${icon.icon}`"
      class="group w-28 overflow-hidden rounded-ui border border-transparent bg-transparent p-2 transition-colors hover:border-primary/60 hover:bg-stone-50 focus-visible:border-primary focus-visible:bg-stone-50 focus-visible:outline-none dark:hover:bg-zinc-900 dark:focus-visible:bg-zinc-900"
      :class="editable ? 'flex h-32 flex-col' : 'flex h-28 flex-col items-center justify-center'"
      @click="editable ? undefined : handleCopy(icon.icon)"
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
            <!-- eslint-disable-next-line vue/no-v-html -->
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
            v-if="showSetName"
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
        v-if="editable"
        data-test="icon-grid-actions"
        class="mt-0.5 flex items-center justify-center gap-0.5"
      >
        <NTooltip trigger="hover">
          <template #trigger>
            <NButton
              quaternary
              circle
              size="tiny"
              aria-label="复制图标"
              @click="handleCopy(icon.icon)"
            >
              <span class="i-[lucide--copy] text-xs" aria-hidden="true" />
            </NButton>
          </template>
          复制
        </NTooltip>

        <NTooltip v-if="canRename" trigger="hover">
          <template #trigger>
            <NButton
              quaternary
              circle
              size="tiny"
              aria-label="重命名图标"
              @click="handleRename(icon)"
            >
              <span class="i-[lucide--pencil-line] text-xs" aria-hidden="true" />
            </NButton>
          </template>
          重命名
        </NTooltip>

        <NTooltip v-if="canDelete" trigger="hover">
          <template #trigger>
            <NButton
              quaternary
              circle
              size="tiny"
              aria-label="删除图标"
              @click="handleDelete(icon)"
            >
              <span class="i-[lucide--trash-2] text-xs" aria-hidden="true" />
            </NButton>
          </template>
          删除
        </NTooltip>
      </div>
    </component>
  </div>
</template>
