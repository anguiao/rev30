import { computed, onUnmounted, ref, shallowRef } from 'vue'
import type { RichTextImageAttrs } from '../../editor'
import {
  createLocalImageDraft,
  createRemoteImageDraft,
  type ImageDraft,
  type ImageDraftState,
  type ImageSessionOptions,
} from '../shared/draft'
import type { ImageLibraryItem } from '../shared/useImageLibrary'

export const maxImageCandidates = 20

interface ImageBatchInsertSessionOptions extends ImageSessionOptions {
  readonly pastedFiles?: readonly File[] | undefined
}

export function useImageBatchInsertSession(options: ImageBatchInsertSessionOptions) {
  const drafts = shallowRef<ImageDraft[]>([])
  const selectedDraft = shallowRef<ImageDraft | null>(null)
  const message = ref('')
  const isUploading = ref(false)

  const candidates = computed(() => drafts.value.map((draft) => draft.state))
  const selected = computed(() => selectedDraft.value?.state ?? null)
  const selectedIndex = computed(() =>
    candidates.value.findIndex((item) => item === selected.value),
  )
  const localToUploadCount = computed(
    () => drafts.value.filter((draft) => draft.needsUpload.value).length,
  )
  const selectedSrcs = computed(() =>
    candidates.value.flatMap((item) => (item.src === null ? [] : [item.src])),
  )
  const atLimit = computed(() => candidates.value.length >= maxImageCandidates)
  const canSubmit = computed(
    () =>
      !isUploading.value &&
      candidates.value.length > 0 &&
      drafts.value.every((draft) => draft.isReady.value),
  )

  let disposed = false

  function reportError(error: unknown) {
    if (!isUploading.value) {
      message.value = '图片读取失败，请重试或移除'
    }

    options.onError?.(error)
  }

  function addLocalFiles(files: readonly File[]) {
    if (disposed || isUploading.value || files.length === 0) {
      return false
    }

    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      message.value = '请选择图片文件'
      return false
    }

    const available = maxImageCandidates - candidates.value.length
    if (images.length > available) {
      message.value =
        available === 0
          ? `已选择 ${maxImageCandidates} 张图片，请先移除再添加`
          : `最多选择 ${maxImageCandidates} 张图片，还可添加 ${available} 张`
      return false
    }

    const added = images.map((file) => createLocalImageDraft(file, reportError))
    drafts.value = [...drafts.value, ...added]
    selectedDraft.value = added[0]!
    message.value = images.length < files.length ? '已忽略非图片文件' : ''

    return true
  }

  function toggleLibraryImage(image: ImageLibraryItem) {
    if (disposed || isUploading.value) {
      return
    }

    const existing = candidates.value.find((item) => item.src === image.src)
    if (existing !== undefined) {
      remove(existing)
      return
    }

    if (atLimit.value) {
      message.value = `已选择 ${maxImageCandidates} 张图片，请先移除再添加`
      return
    }

    const item = createRemoteImageDraft('library', image, reportError)
    drafts.value = [...drafts.value, item]
    selectedDraft.value = item
    message.value = ''
  }

  function select(image: ImageDraftState) {
    if (disposed || isUploading.value) {
      return
    }

    selectedDraft.value = drafts.value.find((draft) => draft.state === image)!
  }

  function moveSelected(direction: -1 | 1) {
    if (disposed || isUploading.value || selectedDraft.value === null) {
      return
    }

    const next = selectedIndex.value + direction
    if (next < 0 || next >= drafts.value.length) {
      return
    }

    const reordered = [...drafts.value]
    reordered.splice(selectedIndex.value, 1)
    reordered.splice(next, 0, selectedDraft.value)
    drafts.value = reordered
  }

  function remove(image: ImageDraftState) {
    if (disposed || isUploading.value) {
      return
    }

    const index = candidates.value.indexOf(image)
    const removed = drafts.value[index]!
    drafts.value = drafts.value.filter((draft) => draft !== removed)
    removed.dispose()

    if (selectedDraft.value === removed) {
      selectedDraft.value = drafts.value[index] ?? drafts.value[index - 1] ?? null
    }

    message.value = ''
  }

  function updateAlt(value: string) {
    if (disposed || isUploading.value) {
      return
    }

    selectedDraft.value?.updateAlt(value)
  }

  function updateWidth(value: number | null) {
    if (disposed || isUploading.value) {
      return
    }

    selectedDraft.value?.updateWidth(value)
  }

  function updateHeight(value: number | null) {
    if (disposed || isUploading.value) {
      return
    }

    selectedDraft.value?.updateHeight(value)
  }

  function resetSize() {
    if (disposed || isUploading.value) {
      return
    }

    selectedDraft.value?.resetSize()
  }

  async function submit(): Promise<RichTextImageAttrs[] | null> {
    if (disposed || !canSubmit.value) {
      return null
    }

    isUploading.value = true
    message.value = ''

    for (const draft of drafts.value) {
      if (draft.needsUpload.value) {
        await draft.upload(options.upload)
      }
      if (disposed) {
        return null
      }
    }

    isUploading.value = false

    const uploadFailures = candidates.value.filter((item) => item.uploadState === 'error').length
    const readFailures = candidates.value.filter((item) => item.readState === 'error').length
    if (uploadFailures + readFailures > 0) {
      const failureLabel =
        uploadFailures > 0 && readFailures > 0
          ? '上传或读取失败'
          : uploadFailures > 0
            ? '上传失败'
            : '读取失败'
      message.value = `${uploadFailures + readFailures} 张图片${failureLabel}，请重试或移除`
      return null
    }

    return drafts.value.map((draft) => draft.getAttrs())
  }

  function retryRead() {
    if (disposed || isUploading.value || selectedDraft.value === null) {
      return
    }

    message.value = ''
    void selectedDraft.value.read()
  }

  function dispose() {
    disposed = true
    for (const draft of drafts.value) {
      draft.dispose()
    }
  }

  if (options.pastedFiles !== undefined) {
    addLocalFiles(options.pastedFiles)
  }

  onUnmounted(dispose)

  return {
    candidates,
    selected,
    selectedIndex,
    selectedSrcs,
    message,
    isUploading,
    localToUploadCount,
    canSubmit,
    addLocalFiles,
    toggleLibraryImage,
    select,
    moveSelected,
    remove,
    updateAlt,
    updateWidth,
    updateHeight,
    resetSize,
    retryRead,
    submit,
    dispose,
  }
}
