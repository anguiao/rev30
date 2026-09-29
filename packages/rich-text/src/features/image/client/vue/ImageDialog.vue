<script setup lang="ts">
import { useDropZone, useFileDialog } from '@vueuse/core'
import { NButton, NModal } from 'naive-ui'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch, type Ref } from 'vue'
import { useRichTextThemeStyle } from '../../../../client/vue/theme'
import type { RichTextImageAttrs } from '../editor'
import ImageCandidateDetails from './ImageCandidateDetails.vue'
import ImageLibraryPanel from './ImageLibraryPanel.vue'
import { useImageCandidates, type ImageCandidate } from './useImageCandidates'
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

const session = useImageCandidates({
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
const dialogContentRef = useTemplateRef<HTMLElement>('dialogContentRef')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dropZoneRef = useTemplateRef<HTMLElement>('dropZoneRef')
const libraryPanelRef = useTemplateRef<InstanceType<typeof ImageLibraryPanel>>('libraryPanelRef')

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
    class="rich-text-theme w-[calc(100vw-32px)] max-w-4xl"
    :style="richTextThemeStyle"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="cancel"
    @after-enter="focusCurrent"
    @keydown="handleKeydown"
    @compositionstart="isComposing = true"
    @compositionend="isComposing = false"
  >
    <div
      ref="dialogContentRef"
      data-test="rich-text-image-dialog-content"
      class="flex max-h-[calc(100dvh-10rem)] min-h-0 flex-col gap-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-2">
          <NButton
            v-if="session.candidates.value.length > 0 || view === 'library'"
            data-test="rich-text-image-file"
            :disabled="session.isUploading.value"
            @click="openFileDialog()"
            >{{ session.isEditing ? '替换图片' : '添加本地图片' }}</NButton
          >
          <NButton
            v-if="listLibraryImages !== undefined"
            data-test="rich-text-image-library-open"
            :disabled="session.isUploading.value"
            :type="view === 'library' ? 'primary' : 'default'"
            :secondary="view === 'library'"
            @click="openLibrary"
            >图片库</NButton
          >
        </div>
        <span
          v-if="!session.isEditing && session.candidates.value.length > 0"
          data-test="rich-text-image-count"
          class="text-sm"
          >已选择 {{ session.candidates.value.length }} / 20 张</span
        >
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
        class="min-h-0 overflow-y-auto rounded-(--rich-text-theme-border-radius)"
        :class="
          isOverDropZone ? 'outline-2 outline-(--rich-text-theme-primary-color) outline-solid' : ''
        "
        @paste="handlePaste"
      >
        <div
          v-if="session.candidates.value.length === 0 && view === 'details'"
          class="flex min-h-44 flex-col items-center justify-center gap-2 rounded-(--rich-text-theme-border-radius) border border-dashed border-(--rich-text-theme-input-border-color) p-4 text-center"
        >
          <NButton
            data-test="rich-text-image-file"
            :disabled="session.isUploading.value"
            @click="openFileDialog()"
            >点击选择或拖入图片</NButton
          >
          <span class="text-sm">最多选择 20 张图片，支持粘贴</span>
          <span class="text-sm">尚未选择图片</span>
        </div>
        <div
          v-else
          class="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]"
          :class="
            session.isEditing ||
            (session.candidates.value.length === 1 && view === 'details') ||
            session.candidates.value.length === 0
              ? 'md:grid-cols-1'
              : ''
          "
        >
          <div
            v-if="
              !session.isEditing &&
              (session.candidates.value.length > 1 ||
                (view === 'library' && session.candidates.value.length > 0))
            "
            data-test="rich-text-image-candidate-list"
            role="listbox"
            :aria-label="view === 'library' ? '已选图片' : '插入顺序'"
            class="max-h-64 overflow-y-auto rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) p-1 md:max-h-[min(55dvh,28rem)]"
          >
            <NButton
              v-for="(candidate, index) in session.candidates.value"
              :key="candidate.id"
              data-test="rich-text-image-candidate"
              role="option"
              :aria-selected="candidate.id === session.selectedId.value"
              :disabled="session.isUploading.value"
              class="mb-1 w-full justify-start text-left"
              :type="candidate.id === session.selectedId.value ? 'primary' : 'default'"
              :secondary="candidate.id === session.selectedId.value"
              @click="selectCandidate(candidate.id)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <img :src="candidate.previewSrc" alt="" class="size-9 shrink-0 object-cover" />
                <span class="min-w-0 truncate">{{ index + 1 }} {{ candidate.name }}</span>
                <span class="shrink-0 text-xs">{{ statusLabel(candidate) }}</span>
              </span>
            </NButton>
          </div>
          <div
            v-if="view === 'details' && session.selected.value !== null"
            class="flex min-w-0 flex-col gap-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <strong class="min-w-0 truncate text-sm">{{ session.selected.value.name }}</strong>
              <div v-if="!session.isEditing" class="flex flex-wrap gap-1">
                <NButton
                  v-if="session.candidates.value.length > 1"
                  data-test="rich-text-image-move-up"
                  size="small"
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
                  >前移</NButton
                >
                <NButton
                  v-if="session.candidates.value.length > 1"
                  data-test="rich-text-image-move-down"
                  size="small"
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
                  >后移</NButton
                >
                <NButton
                  data-test="rich-text-image-remove"
                  size="small"
                  aria-label="移除图片"
                  :disabled="session.isUploading.value"
                  @click="
                    session.remove(
                      session.candidates.value.findIndex(
                        (item) => item.id === session.selectedId.value,
                      ),
                    )
                  "
                  >移除</NButton
                >
              </div>
            </div>
            <ImageCandidateDetails
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
            :library="library"
            :selected-srcs="selectedSrcs"
            :is-editing="session.isEditing"
            :at-limit="atLimit"
            :disabled="session.isUploading.value"
            @select="selectLibraryImage"
          >
            <template v-if="session.selected.value !== null" #back>
              <NButton
                data-test="rich-text-image-library-back"
                size="small"
                :disabled="session.isUploading.value"
                @click="showDetails"
                >返回图片设置</NButton
              >
            </template>
          </ImageLibraryPanel>
        </div>
      </div>

      <div
        v-if="session.message.value"
        data-test="rich-text-image-error"
        role="alert"
        class="text-sm text-(--rich-text-theme-error-color)"
      >
        {{ session.message.value }}
      </div>
      <div
        class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-(--rich-text-theme-input-border-color) pt-3"
      >
        <span class="text-sm" role="status">
          <template v-if="session.isUploading.value">上传中，请稍候</template>
          <template v-else-if="session.localToUploadCount.value > 0"
            >{{ session.localToUploadCount.value }} 张本地图片待上传</template
          >
          <template v-else-if="!session.isEditing && session.candidates.value.length === 0"
            >尚未选择图片</template
          >
        </span>
        <div class="flex gap-2">
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
    </div>
  </NModal>
</template>
