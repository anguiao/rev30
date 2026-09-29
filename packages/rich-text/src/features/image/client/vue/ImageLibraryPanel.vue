<script setup lang="ts">
import { NButton, NInput, type InputInst } from 'naive-ui'
import { ref, useTemplateRef } from 'vue'
import type { ImageLibraryItem } from './useImageCandidates'
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
  <section class="flex min-w-0 flex-col gap-3" aria-label="图片库">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <strong class="text-sm">图片库</strong>
      <slot name="back" />
    </div>
    <div v-if="atLimit && !isEditing" role="status" class="text-sm">
      已选择 20 张图片，请先移除再添加
    </div>
    <div class="flex flex-wrap gap-2">
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
      <NButton data-test="rich-text-image-library-submit" :disabled="disabled" @click="submitSearch"
        >搜索</NButton
      >
    </div>

    <div v-if="library.isLoading.value" role="status" class="py-8 text-center text-sm">
      正在加载图片
    </div>
    <div v-else-if="library.isError.value" role="alert" class="flex items-center gap-2 py-6">
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
      class="py-8 text-center text-sm"
    >
      {{ library.keyword.value === '' ? '暂无可用图片' : '未找到匹配的图片' }}
    </div>
    <div
      v-else-if="library.result.value !== null"
      data-test="rich-text-image-library-options"
      role="listbox"
      aria-label="图片库"
      :aria-multiselectable="!isEditing"
      class="grid max-h-[min(45dvh,25rem)] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
    >
      <NButton
        v-for="image in library.result.value.list"
        :key="image.src"
        data-test="rich-text-image-library-option"
        role="option"
        :aria-selected="isSelected(image.src)"
        :aria-label="image.name"
        :type="isSelected(image.src) ? 'primary' : 'default'"
        :secondary="isSelected(image.src)"
        :disabled="disabled || (atLimit && !isSelected(image.src))"
        class="h-auto min-w-0 p-2"
        @click="select(image)"
      >
        <span class="flex min-w-0 flex-col gap-1">
          <img :src="image.src" alt="" class="h-24 w-full object-contain" />
          <span class="truncate text-sm">{{ image.name }}</span>
          <span class="text-xs">{{ isSelected(image.src) ? '已选择' : '选择' }}</span>
        </span>
      </NButton>
    </div>

    <div
      v-if="library.result.value !== null && library.result.value.total > 0"
      class="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <span>第 {{ library.page.value }} 页 · 共 {{ library.result.value.total }} 张</span>
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
    </div>
  </section>
</template>
