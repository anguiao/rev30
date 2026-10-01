import { computed, onUnmounted, ref, shallowRef } from 'vue'
import type { RichTextImageAttrs } from '../../editor'
import {
  createLocalImageDraft,
  createRemoteImageDraft,
  type ImageDraft,
  type ImageSessionOptions,
} from '../shared/draft'
import type { ImageLibraryItem } from '../shared/useImageLibrary'

interface ImageEditSessionOptions extends ImageSessionOptions {
  readonly existingImage: RichTextImageAttrs
  readonly pastedFiles?: readonly File[] | undefined
}

export function useImageEditSession(options: ImageEditSessionOptions) {
  const message = ref('')
  const isUploading = ref(false)
  const draft = shallowRef(
    createRemoteImageDraft(
      'existing',
      { src: options.existingImage.src, name: options.existingImage.alt ?? '当前图片' },
      reportError,
      options.existingImage,
    ),
  )
  const image = computed(() => draft.value.state)
  const needsUpload = computed(() => draft.value.needsUpload.value)
  const canSubmit = computed(() => !isUploading.value && draft.value.isReady.value)

  let replacementWidth = options.existingImage.width
  let disposed = false

  function reportError(error: unknown) {
    if (!isUploading.value) {
      message.value = '图片读取失败，请重试或替换'
    }

    options.onError?.(error)
  }

  function replace(next: ImageDraft) {
    draft.value.dispose()
    draft.value = next
    message.value = ''
  }

  function replaceLocalFiles(files: readonly File[]) {
    if (disposed || isUploading.value || files.length === 0) {
      return false
    }

    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length !== 1) {
      message.value = images.length === 0 ? '请选择图片文件' : '请选择一张图片'
      return false
    }

    replace(
      createLocalImageDraft(images[0]!, reportError, {
        alt: image.value.alt,
        width: replacementWidth,
      }),
    )
    if (images.length < files.length) {
      message.value = '已忽略非图片文件'
    }

    return true
  }

  function replaceLibraryImage(item: ImageLibraryItem) {
    if (disposed || isUploading.value) {
      return false
    }

    replace(
      createRemoteImageDraft('library', item, reportError, {
        alt: image.value.alt,
        width: replacementWidth,
        height: null,
      }),
    )
    return true
  }

  function updateAlt(value: string) {
    if (disposed || isUploading.value) {
      return
    }

    draft.value.updateAlt(value)
  }

  function updateWidth(value: number | null) {
    if (disposed || isUploading.value) {
      return
    }

    draft.value.updateWidth(value)
    replacementWidth = value
  }

  function updateHeight(value: number | null) {
    if (disposed || isUploading.value) {
      return
    }

    draft.value.updateHeight(value)
    if (value !== null) {
      replacementWidth = image.value.width
    }
  }

  function resetSize() {
    if (disposed || isUploading.value) {
      return
    }

    draft.value.resetSize()
    replacementWidth = image.value.width
  }

  async function submit(): Promise<RichTextImageAttrs | null> {
    if (disposed || !canSubmit.value) {
      return null
    }

    isUploading.value = true
    message.value = ''

    const ready = await draft.value.upload(options.upload)
    if (disposed) {
      return null
    }

    isUploading.value = false

    if (!ready) {
      message.value =
        image.value.uploadState === 'error' ? '图片上传失败，请重试' : '图片读取失败，请重试或替换'
      return null
    }

    return draft.value.getAttrs()
  }

  function retryRead() {
    if (disposed || isUploading.value) {
      return
    }

    message.value = ''
    void draft.value.read()
  }

  function dispose() {
    disposed = true
    draft.value.dispose()
  }

  if (options.pastedFiles !== undefined) {
    replaceLocalFiles(options.pastedFiles)
  }

  onUnmounted(dispose)

  return {
    image,
    needsUpload,
    message,
    isUploading,
    canSubmit,
    replaceLocalFiles,
    replaceLibraryImage,
    updateAlt,
    updateWidth,
    updateHeight,
    resetSize,
    retryRead,
    submit,
    dispose,
  }
}
