<script setup lang="ts">
import { NButton, NInput, NText, type InputInst } from 'naive-ui'
import { computed, onActivated, onDeactivated, ref, useTemplateRef } from 'vue'
import {
  useImageLibrary,
  type ImageLibraryItem,
  type ListRichTextLibraryImages,
} from './useImageLibrary'

const props = defineProps<{
  listImages: ListRichTextLibraryImages
  selectedSrcs: readonly string[]
  multiple: boolean
  selectionLimit?: { count: number; max: number } | undefined
  disabled: boolean
}>()

const emit = defineEmits<{
  back: []
  select: [image: ImageLibraryItem]
}>()

const {
  searchDraft,
  keyword,
  page,
  result,
  isLoading,
  isError,
  hasPreviousPage,
  hasNextPage,
  submitSearch,
  retry,
  previousPage,
  nextPage,
} = useImageLibrary(props.listImages)

const searchInput = useTemplateRef<InputInst>('searchInput')
const isComposing = ref(false)
const atLimit = computed(
  () =>
    props.selectionLimit !== undefined && props.selectionLimit.count >= props.selectionLimit.max,
)

onActivated(() => searchInput.value?.focus())
onDeactivated(() => {
  isComposing.value = false
})

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || isComposing.value) {
    return
  }

  event.preventDefault()
  handleSearch()
}

function handleSearch() {
  if (props.disabled || isComposing.value) {
    return
  }

  submitSearch()
}

function handleRetry() {
  if (!props.disabled) {
    void retry()
  }
}

function handlePreviousPage() {
  if (!props.disabled) {
    previousPage()
  }
}

function handleNextPage() {
  if (!props.disabled) {
    nextPage()
  }
}

function handleSelect(image: ImageLibraryItem) {
  if (!props.disabled) {
    emit('select', image)
  }
}

function isSelected(src: string) {
  return props.selectedSrcs.includes(src)
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col gap-3" aria-label="图片库">
    <div class="flex h-7 shrink-0 items-center justify-between gap-2">
      <NText class="text-sm">图片库</NText>
      <NButton
        data-test="rich-text-image-library-back"
        size="small"
        text
        type="primary"
        :disabled="disabled"
        @click="emit('back')"
      >
        <template #icon><span class="i-[lucide--arrow-left]" aria-hidden="true" /></template>
        返回
      </NButton>
    </div>
    <div v-if="selectionLimit && atLimit" role="status" class="shrink-0 text-sm">
      已选择 {{ selectionLimit.max }} 张图片，请先移除再添加
    </div>
    <div class="flex shrink-0 gap-2">
      <NInput
        ref="searchInput"
        v-model:value="searchDraft"
        data-test="rich-text-image-library-search"
        class="min-w-0 flex-1"
        aria-label="搜索图片名称"
        placeholder="搜索图片名称"
        :disabled="disabled"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @keydown="handleSearchKeydown"
      />
      <NButton
        data-test="rich-text-image-library-submit"
        aria-label="搜索"
        title="搜索"
        :disabled="disabled"
        @click="handleSearch"
      >
        <template #icon><span class="i-[lucide--search]" aria-hidden="true" /></template>
      </NButton>
    </div>

    <div
      v-if="isLoading"
      role="status"
      class="flex min-h-0 flex-1 items-center justify-center text-sm"
    >
      正在加载图片
    </div>
    <div
      v-else-if="isError"
      role="alert"
      class="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm"
    >
      <span>图片库加载失败</span>
      <NButton
        data-test="rich-text-image-library-retry"
        size="small"
        :disabled="disabled"
        @click="handleRetry"
        >重试</NButton
      >
    </div>
    <div
      v-else-if="result?.list.length === 0"
      role="status"
      class="flex min-h-0 flex-1 items-center justify-center text-sm"
    >
      {{ keyword === '' ? '暂无可用图片' : '未找到匹配的图片' }}
    </div>
    <div
      v-else-if="result !== null"
      data-test="rich-text-image-library-options"
      role="listbox"
      aria-label="图片库"
      :aria-multiselectable="multiple"
      class="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto"
    >
      <NButton
        v-for="image in result.list"
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
        @click="handleSelect(image)"
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
      <template v-if="result !== null && result.total > 0">
        <NText depth="3" class="text-xs"> 第 {{ page }} 页 · 共 {{ result.total }} 张 </NText>
        <div class="flex gap-2">
          <NButton
            data-test="rich-text-image-library-previous"
            size="small"
            :disabled="disabled || !hasPreviousPage"
            @click="handlePreviousPage"
            >上一页</NButton
          >
          <NButton
            data-test="rich-text-image-library-next"
            size="small"
            :disabled="disabled || !hasNextPage"
            @click="handleNextPage"
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
