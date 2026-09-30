<script setup lang="ts">
import { useDropZone, useFileDialog } from '@vueuse/core'
import { NButton, NDropdown, NModal, NText, useThemeVars, type DropdownOption } from 'naive-ui'
import { computed, h, nextTick, onMounted, ref, useTemplateRef, watch, type Ref } from 'vue'
import { useRichTextDropdownTrigger } from '../../../../client/vue/interactions/dropdown'
import { useRichTextThemeStyle } from '../../../../client/vue/theme'
import type { RichTextImageAttrs } from '../editor'
import ImagePropertiesPanel from './ImagePropertiesPanel.vue'
import ImageLibraryPanel from './ImageLibraryPanel.vue'
import { useImageDialogSession, type ImageCandidate } from './useImageDialogSession'
import { useImageLibrary, type ListRichTextLibraryImages } from './useImageLibrary'

const props = defineProps<{
  upload: (file: File) => Promise<{ src: string }>
  listLibraryImages?: ListRichTextLibraryImages
  existingImage?: RichTextImageAttrs | undefined
  initialImageFiles?: File[] | undefined
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [attrs: RichTextImageAttrs | RichTextImageAttrs[]]
  error: [error: unknown]
}>()

const session = useImageDialogSession({
  upload: props.upload,
  existingImage: props.existingImage,
  initialImageFiles: props.initialImageFiles,
  onError: (error) => emit('error', error),
})
const library = useImageLibrary(props.listLibraryImages)
const view = ref<'details' | 'library'>('details')
const isComposing = ref(false)
const selectedSrcs = computed(() =>
  session.candidates.value.flatMap((candidate) => (candidate.src === null ? [] : [candidate.src])),
)
const atLimit = computed(() => session.candidates.value.length >= 20)
const richTextThemeStyle = useRichTextThemeStyle()
const themeVars = useThemeVars()
const dialogContentRef = useTemplateRef<HTMLElement>('dialogContentRef')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dropZoneRef = useTemplateRef<HTMLElement>('dropZoneRef')
const libraryPanelRef = useTemplateRef<InstanceType<typeof ImageLibraryPanel>>('libraryPanelRef')
const { show: showSourceMenu, handleTriggerKeydown } = useRichTextDropdownTrigger(
  session.isUploading,
)
const sourceLabel = session.isEditing ? '替换图片' : '添加图片'
const sourceOptions = computed<DropdownOption[]>(() => [
  {
    key: 'local',
    label: '从本地选择',
    icon: () => h('span', { class: 'i-[lucide--folder-open] inline-block', 'aria-hidden': 'true' }),
    props: { role: 'menuitem' },
  },
  ...(props.listLibraryImages === undefined
    ? []
    : [
        {
          key: 'library',
          label: '从图片库选择',
          icon: () =>
            h('span', { class: 'i-[lucide--images] inline-block', 'aria-hidden': 'true' }),
          props: { role: 'menuitem' },
        },
      ]),
])

const { open: openFileDialog, onChange: onFileDialogChange } = useFileDialog({
  accept: 'image/*',
  input: fileInput as Ref<HTMLInputElement>,
  multiple: !session.isEditing,
  reset: true,
})
onFileDialogChange((files) => {
  if (files !== null) addLocalFiles(Array.from(files))
})

const { isOverDropZone } = useDropZone(dropZoneRef, {
  multiple: true,
  preventDefaultForUnhandled: true,
  checkValidity: () => !session.isUploading.value,
  onDrop(files) {
    if (files !== null) addLocalFiles(files)
  },
})

function addLocalFiles(files: File[]) {
  const previousId = session.selectedId.value
  session.addLocalFiles(files)
  if (session.selectedId.value !== previousId) view.value = 'details'
}

function openLibrary() {
  if (session.isUploading.value) return
  view.value = 'library'
  library.open()
  void nextTick(() => libraryPanelRef.value?.focusSearch())
}

function selectSource(key: string | number) {
  if (key === 'local') openFileDialog()
  else if (key === 'library') openLibrary()
}

function showDetails() {
  if (session.isUploading.value) return
  view.value = 'details'
  void nextTick(focusCurrent)
}

function selectLibraryImage(image: { src: string; name: string }) {
  if (session.isUploading.value) return
  if (session.isEditing) {
    session.addLibraryImage(image)
    showDetails()
    return
  }
  if (selectedSrcs.value.includes(image.src)) session.removeLibraryImage(image.src)
  else session.addLibraryImage(image)
}

function selectCandidate(id: number) {
  if (session.isUploading.value) return
  session.select(id)
  showDetails()
}

const confirmLabel = computed(() => {
  if (session.isEditing) {
    return session.localToUploadCount.value > 0 ? '上传并应用' : '应用'
  }
  const count = session.candidates.value.length
  if (count === 0) return '插入'
  return session.localToUploadCount.value > 0 ? `上传并插入 ${count} 张` : `插入 ${count} 张`
})

function statusLabel(candidate: ImageCandidate) {
  if (candidate.uploadState === 'uploading') return '上传中'
  if (candidate.uploadState === 'error') return '上传失败'
  if (candidate.readState === 'error') return '图片读取失败'
  if (candidate.readState === 'loading') return '图片读取中'
  if (candidate.source === 'library') return '图片库'
  if (candidate.source === 'existing') return '当前图片'
  if (candidate.src !== null) return '已上传'
  return session.isUploading.value ? '等待上传' : '待上传'
}

function handlePaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files
  if (event.defaultPrevented || session.isUploading.value || !files || files.length === 0) {
    return
  }
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) {
    return
  }
  event.preventDefault()
  addLocalFiles(Array.from(files))
}

function focusCurrent() {
  if (view.value === 'library') return
  const selector =
    session.selected.value === null
      ? '[data-test="rich-text-image-file"]'
      : '[data-test="rich-text-image-alt"] input'
  dialogContentRef.value?.querySelector<HTMLElement>(selector)?.focus()
}

watch(session.selectedId, () => void nextTick(focusCurrent))
watch(
  () => session.selected.value?.readState,
  (state) => {
    if (state === 'ready' && !session.isUploading.value) void nextTick(focusCurrent)
  },
)
onMounted(() => void nextTick(focusCurrent))

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || isComposing.value) return
  event.preventDefault()
  event.stopPropagation()
  if (showSourceMenu.value) {
    showSourceMenu.value = false
    return
  }
  cancel()
}

function cancel() {
  library.dispose()
  session.dispose()
  emit('cancel')
}

async function confirm() {
  const images = await session.submit()
  if (images === null) return
  emit('confirm', session.isEditing ? images[0]! : images)
}
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    :title="session.isEditing ? '编辑图片' : '插入图片'"
    :aria-label="session.isEditing ? '编辑图片' : '插入图片'"
    class="rich-text-theme"
    :style="[richTextThemeStyle, { width: '680px' }]"
    :content-style="{ padding: 0 }"
    :footer-style="{ padding: '16px 24px' }"
    :segmented="{ footer: true }"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="cancel"
    @after-enter="focusCurrent"
    @keydown="handleKeydown"
    @compositionstart="isComposing = true"
    @compositionend="isComposing = false"
  >
    <div ref="dialogContentRef" data-test="rich-text-image-dialog-content">
      <div class="flex h-[50px] items-center px-6 pb-4">
        <NDropdown
          v-model:show="showSourceMenu"
          trigger="click"
          placement="bottom-start"
          :to="false"
          :options="sourceOptions"
          :disabled="session.isUploading.value"
          :menu-props="() => ({ role: 'menu', 'aria-label': sourceLabel })"
          @select="selectSource"
        >
          <NButton
            data-test="rich-text-image-source"
            :disabled="session.isUploading.value"
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
        :multiple="!session.isEditing"
      />

      <div
        ref="dropZoneRef"
        data-test="rich-text-image-drop-zone"
        class="grid h-[460px] grid-rows-[minmax(0,1fr)] border-t border-(--rich-text-theme-input-divider-color)"
        :class="[
          session.isEditing ? 'grid-cols-1' : 'grid-cols-[11rem_minmax(0,1fr)]',
          isOverDropZone ? 'outline-2 outline-(--rich-text-theme-primary-color) outline-solid' : '',
        ]"
        @paste="handlePaste"
      >
        <div
          v-if="!session.isEditing"
          class="flex min-h-0 flex-col gap-2 border-r border-(--rich-text-theme-input-divider-color) p-2"
          :style="{ backgroundColor: themeVars.actionColor }"
        >
          <NText depth="3" class="shrink-0 px-2 pt-1 text-xs">已选图片</NText>
          <div
            data-test="rich-text-image-candidate-list"
            role="listbox"
            aria-label="已选图片"
            class="grid min-h-0 flex-1 auto-rows-max gap-1 overflow-y-auto"
          >
            <NButton
              v-for="candidate in session.candidates.value"
              :key="candidate.id"
              data-test="rich-text-image-candidate"
              role="option"
              block
              :aria-selected="candidate.id === session.selectedId.value"
              :title="candidate.name"
              :disabled="session.isUploading.value"
              class="image-candidate-button min-w-0"
              style="height: auto; padding: 8px"
              :type="candidate.id === session.selectedId.value ? 'primary' : 'default'"
              :secondary="candidate.id === session.selectedId.value"
              :quaternary="candidate.id !== session.selectedId.value"
              @click="selectCandidate(candidate.id)"
            >
              <span
                class="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 text-left"
              >
                <img
                  :src="candidate.previewSrc"
                  alt=""
                  class="size-9 rounded-(--rich-text-theme-border-radius) object-cover"
                />
                <span class="flex min-w-0 flex-col gap-1">
                  <span class="truncate text-xs">{{ candidate.name }}</span>
                  <span
                    class="text-xs"
                    :class="
                      candidate.uploadState === 'error' || candidate.readState === 'error'
                        ? 'text-(--rich-text-theme-error-color)'
                        : 'text-(--rich-text-theme-muted-text-color)'
                    "
                    >{{ statusLabel(candidate) }}</span
                  >
                </span>
              </span>
            </NButton>
          </div>
        </div>
        <div
          v-if="session.candidates.value.length === 0 && view === 'details'"
          class="flex min-h-0 min-w-0 items-center justify-center p-5"
        >
          <NButton
            data-test="rich-text-image-file"
            block
            dashed
            class="max-w-sm"
            aria-label="点击选择或拖入图片"
            style="height: 180px"
            :disabled="session.isUploading.value"
            @click="openFileDialog()"
          >
            <span class="flex flex-col items-center gap-3 py-6 whitespace-normal">
              <span class="i-[lucide--image-plus] size-8" aria-hidden="true" />
              <span>点击选择或拖入图片</span>
              <NText depth="3" class="text-xs">一次最多选择 20 张图片，支持粘贴</NText>
            </span>
          </NButton>
        </div>
        <div
          v-if="view === 'details' && session.selected.value !== null"
          class="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-5"
        >
          <div class="flex h-7 shrink-0 items-center justify-between gap-2">
            <NText class="min-w-0 truncate text-sm" :title="session.selected.value.name">
              {{ session.selected.value.name }}
            </NText>
            <div v-if="!session.isEditing" class="flex shrink-0 gap-1">
              <NButton
                v-if="session.candidates.value.length > 1"
                data-test="rich-text-image-move-up"
                size="small"
                quaternary
                style="--n-padding: 0 6px"
                title="前移图片"
                aria-label="前移图片"
                :disabled="
                  session.isUploading.value ||
                  session.candidates.value[0]?.id === session.selectedId.value
                "
                @click="
                  session.move(
                    session.candidates.value.findIndex(
                      (item) => item.id === session.selectedId.value,
                    ),
                    -1,
                  )
                "
              >
                <span class="i-[lucide--arrow-up]" aria-hidden="true" />
              </NButton>
              <NButton
                v-if="session.candidates.value.length > 1"
                data-test="rich-text-image-move-down"
                size="small"
                quaternary
                style="--n-padding: 0 6px"
                title="后移图片"
                aria-label="后移图片"
                :disabled="
                  session.isUploading.value ||
                  session.candidates.value.at(-1)?.id === session.selectedId.value
                "
                @click="
                  session.move(
                    session.candidates.value.findIndex(
                      (item) => item.id === session.selectedId.value,
                    ),
                    1,
                  )
                "
              >
                <span class="i-[lucide--arrow-down]" aria-hidden="true" />
              </NButton>
              <NButton
                data-test="rich-text-image-remove"
                size="small"
                quaternary
                style="--n-padding: 0 6px"
                title="移除图片"
                aria-label="移除图片"
                :disabled="session.isUploading.value"
                @click="
                  session.remove(
                    session.candidates.value.findIndex(
                      (item) => item.id === session.selectedId.value,
                    ),
                  )
                "
              >
                <span class="i-[lucide--trash-2]" aria-hidden="true" />
              </NButton>
            </div>
          </div>
          <ImagePropertiesPanel
            :candidate="session.selected.value"
            :disabled="session.isUploading.value"
            @update-alt="session.updateAlt"
            @update-width="session.updateWidth"
            @update-height="session.updateHeight"
            @reset-size="session.resetSize"
            @retry-read="session.retryRead"
          />
        </div>
        <ImageLibraryPanel
          v-if="view === 'library'"
          ref="libraryPanelRef"
          class="p-5"
          :library="library"
          :selected-srcs="selectedSrcs"
          :is-editing="session.isEditing"
          :at-limit="atLimit"
          :disabled="session.isUploading.value"
          @select="selectLibraryImage"
        >
          <template #back>
            <NButton
              data-test="rich-text-image-library-back"
              size="small"
              text
              type="primary"
              :disabled="session.isUploading.value"
              @click="showDetails"
            >
              <template #icon><span class="i-[lucide--arrow-left]" aria-hidden="true" /></template>
              返回
            </NButton>
          </template>
        </ImageLibraryPanel>
      </div>
    </div>
    <template #footer>
      <div class="flex h-10 items-center justify-between gap-3">
        <NText
          v-if="session.message.value"
          data-test="rich-text-image-error"
          type="error"
          role="alert"
          class="min-w-0 flex-1 text-xs"
        >
          {{ session.message.value }}
        </NText>
        <NText v-else depth="3" class="min-w-0 flex-1 text-xs" role="status">
          <template v-if="session.isUploading.value">上传中，请稍候</template>
          <template v-else-if="session.localToUploadCount.value > 0"
            >{{ session.localToUploadCount.value }} 张本地图片待上传</template
          >
          <template v-else-if="!session.isEditing && session.candidates.value.length === 0"
            >尚未选择图片</template
          >
        </NText>
        <div class="ml-auto flex shrink-0 gap-2">
          <NButton data-test="rich-text-image-cancel" @click="cancel">取消</NButton>
          <NButton
            data-test="rich-text-image-confirm"
            type="primary"
            :loading="session.isUploading.value"
            :disabled="!session.canSubmit.value"
            @click="confirm"
            >{{ confirmLabel }}</NButton
          >
        </div>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.image-candidate-button :deep(.n-button__content) {
  width: 100%;
}
</style>
