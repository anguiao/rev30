<script setup lang="ts">
import { useDropZone, useFileDialog } from '@vueuse/core'
import { NButton, NDropdown, NModal, NText, type DropdownOption } from 'naive-ui'
import {
  KeepAlive,
  computed,
  h,
  nextTick,
  onMounted,
  ref,
  useTemplateRef,
  watch,
  type Ref,
} from 'vue'
import { useRichTextDropdownTrigger } from '../../../../../client/vue/interactions/dropdown'
import { useRichTextThemeStyle } from '../../../../../client/vue/theme'
import type { ImageDraftState } from './draft'
import ImageLibraryPanel from './ImageLibraryPanel.vue'
import type { ImageLibraryItem, ListRichTextLibraryImages } from './useImageLibrary'

const props = defineProps<{
  title: string
  sourceLabel: string
  multiple: boolean
  image: ImageDraftState | null
  selectedSrcs: readonly string[]
  selectionLimit?: { count: number; max: number } | undefined
  listLibraryImages?: ListRichTextLibraryImages | undefined
  uploading: boolean
  canConfirm: boolean
  confirmLabel: string
  message: string
  status: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
  selectFiles: [files: File[]]
  selectLibraryImage: [image: ImageLibraryItem]
}>()

const showLibrary = defineModel<boolean>('showLibrary', { required: true })

const isComposing = ref(false)
const richTextThemeStyle = useRichTextThemeStyle()
const content = useTemplateRef<HTMLElement>('content')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dropZone = useTemplateRef<HTMLElement>('dropZone')
const { show: showSourceMenu, handleTriggerKeydown } = useRichTextDropdownTrigger(
  () => props.uploading,
)
const sourceOptions = computed(() => {
  const options: DropdownOption[] = [
    {
      key: 'local',
      label: '从本地选择',
      icon: () =>
        h('span', { class: 'i-[lucide--folder-open] inline-block', 'aria-hidden': 'true' }),
      props: { role: 'menuitem' },
    },
  ]

  if (props.listLibraryImages !== undefined) {
    options.push({
      key: 'library',
      label: '从图片库选择',
      icon: () => h('span', { class: 'i-[lucide--images] inline-block', 'aria-hidden': 'true' }),
      props: { role: 'menuitem' },
    })
  }

  return options
})

const { open: openFileDialog, onChange: onFileDialogChange } = useFileDialog({
  accept: 'image/*',
  input: fileInput as Ref<HTMLInputElement>,
  multiple: props.multiple,
  reset: true,
})
onFileDialogChange((files) => {
  if (files !== null && !props.uploading) {
    emit('selectFiles', Array.from(files))
  }
})
const { isOverDropZone } = useDropZone(dropZone, {
  multiple: true,
  preventDefaultForUnhandled: true,
  checkValidity: () => !props.uploading,
  onDrop(files) {
    if (files !== null && !props.uploading) {
      emit('selectFiles', files)
    }
  },
})

function handleSourceSelect(key: string | number) {
  if (props.uploading) {
    return
  }

  if (key === 'local') {
    openFileDialog()
  } else if (key === 'library') {
    showLibrary.value = true
  }
}

function handlePaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files
  if (event.defaultPrevented || props.uploading || !files || files.length === 0) {
    return
  }

  if (
    event.target instanceof Element &&
    event.target.closest('input, textarea, [contenteditable="true"]')
  ) {
    return
  }

  event.preventDefault()
  emit('selectFiles', Array.from(files))
}

function focusCurrent() {
  if (showLibrary.value) {
    return
  }

  content.value
    ?.querySelector<HTMLElement>(
      'button[data-rich-text-image-focus], [data-rich-text-image-focus] input',
    )
    ?.focus()
}

watch(showLibrary, (show) => {
  if (!show) {
    void nextTick(focusCurrent)
  }
})

watch([() => props.image?.id, () => props.image?.readState], () => {
  if (!props.uploading) {
    void nextTick(focusCurrent)
  }
})

onMounted(() => void nextTick(focusCurrent))

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || isComposing.value) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  if (showSourceMenu.value) {
    showSourceMenu.value = false
  } else {
    emit('cancel')
  }
}
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    :title="title"
    :aria-label="title"
    class="rich-text-theme"
    :style="[richTextThemeStyle, { width: '680px' }]"
    :content-style="{ padding: 0 }"
    :footer-style="{ padding: '16px 24px' }"
    :segmented="{ footer: true }"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="emit('cancel')"
    @after-enter="focusCurrent"
    @keydown="handleKeydown"
    @compositionstart="isComposing = true"
    @compositionend="isComposing = false"
  >
    <div ref="content" data-test="rich-text-image-dialog-content">
      <div class="flex h-[50px] items-center px-6 pb-4">
        <NDropdown
          v-model:show="showSourceMenu"
          trigger="click"
          placement="bottom-start"
          :to="false"
          :options="sourceOptions"
          :disabled="uploading"
          :menu-props="() => ({ role: 'menu', 'aria-label': sourceLabel })"
          @select="handleSourceSelect"
        >
          <NButton
            data-test="rich-text-image-source"
            :disabled="uploading"
            aria-haspopup="menu"
            :aria-expanded="showSourceMenu"
            @keydown="handleTriggerKeydown"
          >
            <template #icon><span class="i-[lucide--plus]" aria-hidden="true" /></template>
            {{ sourceLabel }}
            <span class="ml-2 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
          </NButton>
        </NDropdown>
      </div>
      <input
        ref="fileInput"
        data-test="rich-text-image-file-input"
        class="hidden"
        type="file"
        accept="image/*"
        :multiple="multiple"
      />
      <div
        ref="dropZone"
        data-test="rich-text-image-drop-zone"
        class="grid h-[460px] grid-rows-[minmax(0,1fr)] border-t border-(--rich-text-theme-input-divider-color)"
        :class="[
          $slots.sidebar ? 'grid-cols-[11rem_minmax(0,1fr)]' : 'grid-cols-1',
          isOverDropZone ? 'outline-2 outline-(--rich-text-theme-primary-color) outline-solid' : '',
        ]"
        @paste="handlePaste"
      >
        <slot name="sidebar" />
        <slot v-if="!showLibrary" :open-file-dialog="openFileDialog" />
        <KeepAlive>
          <ImageLibraryPanel
            v-if="showLibrary && listLibraryImages"
            class="p-5"
            :list-images="listLibraryImages"
            :selected-srcs="selectedSrcs"
            :multiple="multiple"
            :selection-limit="selectionLimit"
            :disabled="uploading"
            @back="showLibrary = false"
            @select="emit('selectLibraryImage', $event)"
          />
        </KeepAlive>
      </div>
    </div>
    <template #footer>
      <div class="flex h-10 items-center justify-between gap-3">
        <NText
          v-if="message"
          data-test="rich-text-image-error"
          type="error"
          role="alert"
          class="min-w-0 flex-1 text-xs"
          >{{ message }}</NText
        >
        <NText v-else depth="3" class="min-w-0 flex-1 text-xs" role="status">{{
          uploading ? '上传中，请稍候' : status
        }}</NText>
        <div class="ml-auto flex shrink-0 gap-2">
          <NButton data-test="rich-text-image-cancel" @click="emit('cancel')">取消</NButton>
          <NButton
            data-test="rich-text-image-confirm"
            type="primary"
            :loading="uploading"
            :disabled="!canConfirm"
            @click="emit('confirm')"
            >{{ confirmLabel }}</NButton
          >
        </div>
      </div>
    </template>
  </NModal>
</template>
