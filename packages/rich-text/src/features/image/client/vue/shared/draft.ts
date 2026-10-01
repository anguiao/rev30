import { computed, reactive } from 'vue'
import type { RichTextImageAttrs } from '../../editor'
import type { ImageLibraryItem } from './useImageLibrary'

export type ImageUpload = (file: File) => Promise<{ src: string }>

export interface ImageSessionOptions {
  readonly upload: ImageUpload
  readonly onError?: ((error: unknown) => void) | undefined
}

interface ImageDraftData {
  readonly source: 'local' | 'library' | 'existing'
  readonly name: string
  src: string | null
  previewSrc: string
  alt: string
  width: number | null
  height: number | null
}

export interface ImageDraftState extends ImageDraftData {
  readonly id: symbol
  naturalSize: { width: number; height: number } | null
  readState: 'loading' | 'ready' | 'error'
  uploadState: 'pending' | 'uploading' | 'uploaded' | 'error'
}

export type ImageDraft = ReturnType<typeof createImageDraft>

function readNaturalSize(src: string, signal: AbortSignal) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()

    function cleanup() {
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', abort)
    }

    function abort() {
      cleanup()
      image.src = ''
      reject(new DOMException('Image read canceled', 'AbortError'))
    }

    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight }
      cleanup()
      if (size.width <= 0 || size.height <= 0) {
        reject(new Error('图片尺寸无效'))
      } else {
        resolve(size)
      }
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('图片加载失败'))
    }

    signal.addEventListener('abort', abort, { once: true })
    image.src = src
  })
}

function fittedHeight(width: number, size: { width: number; height: number }) {
  return Math.max(1, Math.round((width * size.height) / size.width))
}

function fittedWidth(height: number, size: { width: number; height: number }) {
  return Math.max(1, Math.round((height * size.width) / size.height))
}

function validSize(value: number | null) {
  return value !== null && Number.isInteger(value) && value > 0
}

function createImageDraft(
  data: ImageDraftData,
  file: File | null,
  onError: ImageSessionOptions['onError'],
) {
  const state = reactive<ImageDraftState>({
    ...data,
    id: Symbol(),
    naturalSize: null,
    readState: 'loading',
    uploadState: file === null ? 'uploaded' : 'pending',
  })
  const isReady = computed(
    () => state.readState === 'ready' && validSize(state.width) && validSize(state.height),
  )
  const needsUpload = computed(() => file !== null && state.src === null)

  let objectUrl = file === null ? null : data.previewSrc
  let reader: AbortController | null = null
  let disposed = false

  function releaseObjectUrl() {
    if (objectUrl === null) {
      return
    }

    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }

  async function read() {
    if (disposed) {
      return false
    }

    reader?.abort()
    const controller = new AbortController()
    reader = controller
    state.readState = 'loading'

    try {
      const size = await readNaturalSize(state.previewSrc, controller.signal)
      if (disposed || controller.signal.aborted) {
        return false
      }

      state.readState = 'ready'

      // An uploaded copy may be compressed; retain the user's original display dimensions.
      if (file === null || state.src === null) {
        state.naturalSize = size
        if (state.width === null && state.height === null) {
          state.width = size.width
          state.height = size.height
        } else if (state.width !== null && state.height === null) {
          state.height = fittedHeight(state.width, size)
        } else if (state.width === null && state.height !== null) {
          state.width = fittedWidth(state.height, size)
        }
      }

      if (state.src !== null) {
        releaseObjectUrl()
      }

      return true
    } catch (error) {
      if (disposed || controller.signal.aborted) {
        return false
      }

      state.readState = 'error'
      onError?.(error)
      return false
    } finally {
      if (reader === controller) {
        reader = null
      }
    }
  }

  async function upload(uploadFile: ImageUpload) {
    if (disposed) {
      return false
    }

    if (file === null || state.src !== null) {
      return isReady.value
    }

    state.uploadState = 'uploading'

    try {
      const uploaded = await uploadFile(file)
      if (disposed) {
        return false
      }

      if (uploaded.src === '') {
        throw new Error('图片加载失败')
      }

      state.src = uploaded.src
      state.previewSrc = uploaded.src
      state.uploadState = 'uploaded'
    } catch (error) {
      if (disposed) {
        return false
      }

      state.uploadState = 'error'
      onError?.(error)
      return false
    }

    return read()
  }

  function updateAlt(value: string) {
    state.alt = value
  }

  function updateWidth(value: number | null) {
    state.width = value
    if (value !== null && state.naturalSize !== null) {
      state.height = fittedHeight(value, state.naturalSize)
    }
  }

  function updateHeight(value: number | null) {
    state.height = value
    if (value !== null && state.naturalSize !== null) {
      state.width = fittedWidth(value, state.naturalSize)
    }
  }

  function resetSize() {
    if (state.naturalSize === null) {
      return
    }

    state.width = state.naturalSize.width
    state.height = state.naturalSize.height
  }

  function getAttrs(): RichTextImageAttrs {
    return { src: state.src!, alt: state.alt, width: state.width, height: state.height }
  }

  function dispose() {
    disposed = true
    reader?.abort()
    releaseObjectUrl()
  }

  void read()

  return {
    state,
    isReady,
    needsUpload,
    read,
    upload,
    updateAlt,
    updateWidth,
    updateHeight,
    resetSize,
    getAttrs,
    dispose,
  }
}

export function createLocalImageDraft(
  file: File,
  onError: ImageSessionOptions['onError'],
  attrs: { alt: string; width: number | null } = { alt: file.name, width: null },
) {
  return createImageDraft(
    {
      source: 'local',
      name: file.name,
      src: null,
      previewSrc: URL.createObjectURL(file),
      ...attrs,
      height: null,
    },
    file,
    onError,
  )
}

export function createRemoteImageDraft(
  source: 'library' | 'existing',
  image: ImageLibraryItem,
  onError: ImageSessionOptions['onError'],
  attrs: Omit<RichTextImageAttrs, 'src'> = { alt: image.name, width: null, height: null },
) {
  return createImageDraft(
    {
      source,
      name: image.name,
      src: image.src,
      previewSrc: image.src,
      ...attrs,
      alt: attrs.alt ?? '',
    },
    null,
    onError,
  )
}
