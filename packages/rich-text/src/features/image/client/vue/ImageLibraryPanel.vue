<script setup lang="ts">
import { NButton, NInput, NText, type InputInst } from 'naive-ui'
import { ref, useTemplateRef } from 'vue'
import type { ImageLibraryItem } from './useImageDialogSession'
import type { useImageLibrary } from './useImageLibrary'

const props = defineProps<{
  library: ReturnType<typeof useImageLibrary>
  selectedSrcs: readonly string[]
  isEditing: boolean
  atLimit: boolean
  disabled: boolean
}>()

const emit = defineEmits<{ select: [image: ImageLibraryItem] }>()
const searchRef = useTemplateRef<InputInst>('searchRef')
const composing = ref(false)

function focusSearch() {
  searchRef.value?.focus()
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || composing.value) return
  event.preventDefault()
  submitSearch()
}

function submitSearch() {
  if (props.disabled || composing.value) return
  props.library.submitSearch()
}

function retry() {
  if (!props.disabled) void props.library.retry()
}

function previousPage() {
  if (!props.disabled) props.library.previousPage()
}

function nextPage() {
  if (!props.disabled) props.library.nextPage()
}

function select(image: ImageLibraryItem) {
  if (!props.disabled) emit('select', image)
}

function isSelected(src: string) {
  return props.selectedSrcs.includes(src)
}

defineExpose({ focusSearch })
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col gap-3" aria-label="图片库">
    <div class="flex h-7 shrink-0 items-center justify-between gap-2">
      <NText class="text-sm">图片库</NText>
      <slot name="back" />
    </div>
    <div v-if="atLimit && !isEditing" role="status" class="shrink-0 text-sm">
      已选择 20 张图片，请先移除再添加
    </div>
    <div class="flex shrink-0 gap-2">
      <NInput
        ref="searchRef"
        data-test="rich-text-image-library-search"
        class="min-w-0 flex-1"
        aria-label="搜索图片名称"
        placeholder="搜索图片名称"
        :value="library.searchDraft.value"
        :disabled="disabled"
        @update:value="library.setSearchDraft"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown="handleSearchKeydown"
      />
      <NButton
        data-test="rich-text-image-library-submit"
        aria-label="搜索"
        title="搜索"
        :disabled="disabled"
        @click="submitSearch"
      >
        <template #icon><span class="i-[lucide--search]" aria-hidden="true" /></template>
      </NButton>
    </div>

    <div
      v-if="library.isLoading.value"
      role="status"
      class="flex min-h-0 flex-1 items-center justify-center text-sm"
    >
      正在加载图片
    </div>
    <div
      v-else-if="library.isError.value"
      role="alert"
      class="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm"
    >
      <span>图片库加载失败</span>
      <NButton
        data-test="rich-text-image-library-retry"
        size="small"
        :disabled="disabled"
        @click="retry"
        >重试</NButton
      >
    </div>
    <div
      v-else-if="library.result.value?.list.length === 0"
      role="status"
      class="flex min-h-0 flex-1 items-center justify-center text-sm"
    >
      {{ library.keyword.value === '' ? '暂无可用图片' : '未找到匹配的图片' }}
    </div>
    <div
      v-else-if="library.result.value !== null"
      data-test="rich-text-image-library-options"
      role="listbox"
      aria-label="图片库"
      :aria-multiselectable="!isEditing"
      class="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto"
    >
      <NButton
        v-for="image in library.result.value.list"
        :key="image.src"
        data-test="rich-text-image-library-option"
        role="option"
        :aria-selected="isSelected(image.src)"
        :aria-label="image.name"
        :title="image.name"
        :type="isSelected(image.src) ? 'primary' : 'default'"
        :secondary="isSelected(image.src)"
        :disabled="disabled || (atLimit && !isSelected(image.src))"
        class="image-library-card min-w-0 overflow-hidden"
        style="height: auto; padding: 0"
        @click="select(image)"
      >
        <span class="flex w-full min-w-0 flex-col">
          <span class="flex h-24 items-center justify-center bg-(--rich-text-theme-input-color)">
            <img :src="image.src" alt="" class="h-full w-full object-contain" />
          </span>
          <span class="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
            <span class="truncate text-xs">{{ image.name }}</span>
            <span
              class="size-4 shrink-0"
              :class="isSelected(image.src) ? 'i-[lucide--square-check]' : 'i-[lucide--square]'"
              aria-hidden="true"
            />
          </span>
        </span>
      </NButton>
    </div>

    <div class="flex h-7 shrink-0 items-center justify-between gap-2">
      <template v-if="library.result.value !== null && library.result.value.total > 0">
        <NText depth="3" class="text-xs">
          第 {{ library.page.value }} 页 · 共 {{ library.result.value.total }} 张
        </NText>
        <div class="flex gap-2">
          <NButton
            data-test="rich-text-image-library-previous"
            size="small"
            :disabled="disabled || library.isLoading.value || library.page.value <= 1"
            @click="previousPage"
            >上一页</NButton
          >
          <NButton
            data-test="rich-text-image-library-next"
            size="small"
            :disabled="
              disabled ||
              library.isLoading.value ||
              library.page.value * 20 >= library.result.value.total
            "
            @click="nextPage"
            >下一页</NButton
          >
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.image-library-card :deep(.n-button__content) {
  width: 100%;
}
</style>
