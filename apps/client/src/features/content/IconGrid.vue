<script setup lang="ts">
import { NButton, NTooltip } from 'naive-ui'
import type { CustomIconItem, IconSetRenderableIcon } from '@rev30/contracts'

const props = withDefaults(
  defineProps<{
    icons: Array<IconSetRenderableIcon | CustomIconItem>
    editable: boolean
    canRename?: boolean
    canDelete?: boolean
  }>(),
  {
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
  <div class="grid grid-cols-[repeat(auto-fill,11rem)] gap-3">
    <component
      :is="editable ? 'div' : 'button'"
      v-for="icon in icons"
      :key="icon.icon"
      data-test="icon-grid-item"
      :type="editable ? undefined : 'button'"
      :aria-label="editable ? undefined : `复制图标 ${icon.icon}`"
      class="w-44 rounded-md border border-stone-200 bg-white p-3 text-left transition-colors hover:border-primary hover:bg-stone-50 focus-visible:border-primary focus-visible:bg-stone-50 focus-visible:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus-visible:bg-zinc-900"
      :class="editable ? 'flex h-24 flex-col' : 'flex h-22 items-start gap-3'"
      @click="editable ? undefined : handleCopy(icon.icon)"
    >
      <div class="flex min-w-0 items-start gap-3">
        <div
          class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-stone-50 p-2 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <svg
            class="h-full w-full text-stone-700 dark:text-zinc-200"
            :viewBox="getViewBox(icon.width, icon.height)"
            fill="currentColor"
            aria-hidden="true"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <g v-html="icon.body" />
          </svg>
        </div>

        <div class="min-w-0 flex-1 pt-1">
          <div class="text-xs text-stone-500 dark:text-zinc-400">
            {{ icon.setName }}
          </div>
          <NTooltip trigger="hover">
            <template #trigger>
              <div
                data-test="icon-grid-name"
                class="mt-1 max-w-full truncate text-sm font-medium text-stone-900 dark:text-zinc-100"
              >
                {{ icon.name }}
              </div>
            </template>
            {{ icon.icon }}
          </NTooltip>
        </div>
      </div>

      <div
        v-if="editable"
        data-test="icon-grid-actions"
        class="mt-1 flex items-center justify-end gap-1"
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
